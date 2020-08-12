const path = require('path');
const { trim, isError, isEmpty, isInteger, map, first, isString } = require('lodash');
const { exec } = require('../utils/exec');
const fs = require('fs');
const util = require('util');
const { spawn, execSync } = require('child_process');
const { satisfies, minVersion } = require("semver");
const writeFile = util.promisify(fs.writeFile);
const readFile = util.promisify(fs.readFile);
const { flatMap } = require('lodash');

const ora = require('ora');

const { BaseError } = require("make-error-cause");

class TerraformError extends BaseError {
    constructor(tfPath, cause) {
        super(cause.message, cause);
        this.tfPath = tfPath;
    }
}
class ProcessError extends BaseError {
    constructor(code, cause) {
        super(cause.message, cause);
        this.code = code;
    }
}

const outputs = {};
const terraformResourcesBasePath = path.join(__dirname, '../../resources/terraform');

class Terraform {
    constructor(skipVersionCheck = false) {
        this.outputs = outputs;

        if (!skipVersionCheck) {
            this.checkSupportedVersions();
        }
    }

    setCachePath(cachePath) {
        this.cachePath = cachePath;
    }

    getCachePath() {
        return this.cachePath;
    }

    setTargetPath(name) {
        this.targetPath = path.join(this.cachePath, name);
    }

    async copyTerraformInfraTemplate({ cloud }) {
        const sourcePath = path.join(terraformResourcesBasePath, cloud.type);

        const copyResult = await exec(`cp -R ${sourcePath}/* ${this.targetPath} && rm -f ${path.join(this.targetPath, 'eip.tf')} && rm -f ${path.join(this.targetPath, 'ethereum-ebs*')}`, { cwd: sourcePath });
        if (isError(copyResult)) {
            throw copyResult;
        }

        if (copyResult.exitCode !== 0) {
            throw new Error(`Copy Terraform infra base has failed! Process said: ${copyResult.stderr}`);
        }

        if (cloud.ip) {
            const copyEipResult = await exec(`cp ${sourcePath}/eip.tf ${this.targetPath} && touch ${path.join(this.targetPath, '.eip')}`, { cwd: sourcePath });
            if (isError(copyEipResult)) {
                throw copyEipResult;
            }

            if (copyEipResult.exitCode !== 0) {
                throw new Error(`Copy Terraform Elastic IP template has failed! Process said: ${copyEipResult.stderr}`);
            }
        }

        if (cloud.efsId) {
            fs.writeFileSync(path.join(this.targetPath, '.efs'), cloud.efsId);
        }

        if (!cloud.backend) {
            await exec(`rm -f ${path.join(this.targetPath, 'backend.tf')}`);
        } else {
            await this.updateBackendFile({ name: `orbs-${cloud.region}-${cloud.name}`, region: cloud.region, pathToBackendFile: path.join(this.targetPath, 'backend.tf') });
        }
    }

    async updateBackendFile({ region, pathToBackendFile, name }) {
        let backendContent = await readFile(pathToBackendFile, 'utf-8');
        backendContent = backendContent.replace('__region__', region);
        backendContent = backendContent.replace('__name__', name);
        return writeFile(pathToBackendFile, backendContent);
    }

    createTerraformVariablesFile({ cloud, keys }) {
        const rows = [];

        // SSH key specific variables
        rows.push({ path_to_ssh_pubkey: keys.ssh.path });

        if (!isEmpty(keys.ssh.cidr)) {
            rows.push({ incoming_ssh_cidr_blocks: keys.ssh.cidr });
        }

        rows.push(
            { name: cloud.name },
            { aws_profile: keys.aws.profile },
            { region: cloud.region },
            { boyarUrl: cloud.boyarTargetUrl },
            { instance_type: cloud.instanceType },
            { instance_count: isInteger(cloud.nodeCount) ? cloud.nodeCount : 2 },
            { bootstrap_url: cloud.bootstrapUrl || "" },
        );

        const managementConfig = cloud.managementConfig;

        if (!isEmpty(managementConfig)) {
            rows.push({
                boyar_management_config: `<<EOF\n${JSON.stringify(managementConfig)}\nEOF`,
                multiline: true
            });
        }

        if (!isEmpty(keys.orbs.ethereumEndpoint)) {
            rows.push({ ethereum_endpoint: keys.orbs.ethereumEndpoint });
        }

        if (!isEmpty(keys.orbs.ethereumTopologyContractAddress)) {
            rows.push({ ethereum_topology_contract_address: keys.orbs.ethereumTopologyContractAddress });
        }

        return map(rows, (row) => {
            const key = first(Object.keys(row));
            const value = row[key];
            const serializedValue = isString(value) && value.substr(0, 5) == "<<EOF" ? value : JSON.stringify(value);
            return `${key} = ${serializedValue}\n`;
        }).join("");
    }

    async writeTerraformVariablesFile({ cloud, keys }) {
        const contentAsString = this.createTerraformVariablesFile({ cloud, keys });
        const target = path.join(this.targetPath, 'terraform.tfvars');

        return writeFile(target, contentAsString);
    }

    async createTerraformProject({ cloud, keys }) {
        await this.createTerraformFolder();
        await this.writeTerraformVariablesFile({ cloud, keys });
        await this.copyTerraformInfraTemplate({ cloud });
    }

    async create({ cloud, keys }) {
        const eip = 'ip' in cloud;
        const { name } = cloud;
        this.setTargetPath(name);

        const varsObject = {
            node_key_pair: base64JSON(serializeKeys(keys.orbs.nodeKeys)),
        };

        if (!isEmpty(keys.ssl) && !isEmpty(keys.ssl.sslCertificatePath)) {
            varsObject.ssl_certificate = fs.readFileSync(keys.ssl.sslCertificatePath).toString("base64");
        }

        if (!isEmpty(keys.ssl) && !isEmpty(keys.ssl.sslPrivateKeyPath)) {
            varsObject.ssl_private_key = fs.readFileSync(keys.ssl.sslPrivateKeyPath).toString("base64");
        }

        this.spinner = ora('Performing initial checks').start();

        try {
            this.spinner.succeed();
            this.spinner.start(`Generating Terraform code at ${this.targetPath}`);
            await this.createTerraformProject({ cloud, keys });

            this.spinner.succeed();
            this.spinner.start(`Terraform initialize`);

            await this.init({ cloud });
            this.spinner.succeed();

            if (eip) {
                this.spinner.start(`Importing IP ${cloud.ip}`);
                // If we need to bind the manager to an existing Elastic IP then let's import
                // it into our terraform execution context directory.
                await this.importExistingIp({ cloud });
                this.spinner.succeed();
            }

            if (this.efsId() && !cloud.ephemeralStorage) {
                this.spinner.start(`Importing EFS ${this.efsId()}`);
                cloud.efs = this.efsId();
                await this.importExistingEFS({ cloud });
                this.spinner.succeed();
            }

            this.spinner.start(`Creating node ${name} on AWS`);
            const { outputs } = await this.apply({ varsObject, cloud });
            this.spinner.succeed();

            if (eip) {
                outputs[outputs.findIndex(o => o.key === 'manager_ip')].value = cloud.ip;
            }

            if (!cloud.ephemeralStorage) {
                try {
                    console.log('writing EFS ID after we finished the terraform apply phase');
                    const efsId = outputs[outputs.findIndex(o => o.key === 'block_storage')].value;
                    console.log('the target path is: ', this.targetPath);
                    fs.writeFileSync(path.join(this.targetPath, '.efs'), efsId);
                } catch (e) {
                    console.log(e);
                    console.log(outputs);
                }
            }


            return {
                ok: true, // TODO
                tfPath: this.targetPath,
                outputs,
                name
            };
        } catch (err) {
            this.spinner.fail();
            throw new TerraformError(this.targetPath, err);
        }
    }

    async destroy({ cloud, keys }) {
        this.spinner = ora('Perform initial checks').start();

        try {
            const { name } = cloud;
            this.setTargetPath(name);
            this.spinner.succeed();

            await this.createTerraformProject({ cloud, keys });
            await this.init({ cloud });

            if (cloud.ip) {
                this.spinner.start('Detaching Elastic IP from Terraform context');
                // Looks like an Elastic IP was imported to this Terraform build
                // Let's detach it from Terraform so that we don't destroy it.
                await this.detachElasticIP();
                this.spinner.succeed();
            }

            if (this.efsId() && !cloud.ephemeralStorage) {
                this.spinner.start('Detaching EFS from Terraform context');
                // Let's detach it from Terraform so that we don't destroy it.
                await this.detachEFS();
                this.spinner.succeed();
            }

            this.spinner.start(`Destroying node ${name} resources in AWS`);
            await this.terraformDestroy({ name });
            this.spinner.succeed();

            return {
                ok: true, // TODO
                tfPath: this.targetPath,
            };
        } catch (err) {
            this.spinner.fail();
            throw new TerraformError(this.targetPath, err);
        }
    }

    executeTerraform(name, op, tfProcess, getOutputs = () => []) {
        tfProcess.stdout.on('data', (data) => {
            log(data.toString(), name, op);
        });

        tfProcess.stderr.on('data', (data) => {
            log(data.toString(), name, op, 'err');
        });

        return new Promise((resolve, reject) => {
            tfProcess.on('close', (code) => {
                if (code === 0) {
                    resolve({ code, outputs: getOutputs() });
                } else {
                    this.spinner.fail();
                    console.log('');
                    console.log('');
                    console.log(this.outputs[name].ops[op].err.join('\n'));

                    reject(new ProcessError(code, 'Could not perform Terraform operation ' + op));
                }
            });
        });
    }

    terraformDestroy({ name }) {
        const tfDestroySpawn = spawn('terraform', ['destroy', '-var-file=terraform.tfvars', '-auto-approve', '-refresh'], {
            cwd: this.targetPath,
        });
        return this.executeTerraform(name, 'tf-destroy', tfDestroySpawn);
    }

    async status({ cloud, keys }) {
        this.spinner = ora('Inspecting Orbs node').start();

        const { name } = cloud;
        this.setTargetPath(name);

        if (fs.existsSync(path.join(this.targetPath, 'terraform.tfvars'))) {
            this.spinner.succeed();
            this.spinner.start(`Inspecting Terraform project internal state (reconciliation)..`);
            await this.terraformRefresh({ name });
            this.spinner.succeed();

            this.spinner.start(`Inspecting state after reconciliation..`);
            const currentState = await this.terraformShow();

            const { outputs } = currentState.values;

            if ('main_vpc_id' in outputs &&
                'manager_dns' in outputs &&
                'manager_ip' in outputs &&
                'block_storage' in outputs) {
                if (outputs.main_vpc_id.value.length > 0 &&
                    outputs.manager_dns.value.length > 0 &&
                    outputs.manager_ip.value.length > 0 &&
                    outputs.block_storage.value.length > 0) {

                    this.spinner.succeed();
                    this.spinner.start(`Looking for the manager EC2 instance..`);

                    await this.checkManagerLivenessWithAWSCLI({
                        profile: keys.aws.profile,
                        region: cloud.region,
                        ip: outputs.manager_ip.value,
                        dns: outputs.manager_dns.value,
                    });
                }
            } else {
                this.spinner.fail('State outputs missing important key(s)');
                return {
                    ok: false,
                    message: 'Internal Terraform state missing keys that indicate infrastructure correctness on AWS'
                };
            }

        } else {
            this.spinner.succeed();
            return false;
        }
    }

    async checkManagerLivenessWithAWSCLI({ ip, dns, profile, region }) {
        let result = await exec(`aws ec2 describe-instances --region ${region} --profile ${profile}`);
        if (result.exitCode === 0) {
            let ec2Instances = JSON.parse(result.stdout);
            const managerIndex = ec2Instances.Reservations[0].Instances.findIndex(o => o.PublicDnsName === dns);
            let managerInstance = ec2Instances.Reservations[0].Instances[managerIndex];

            this.spinner.succeed();
            this.spinner.start(`Checking the manager's instance state..`);

            if (managerInstance.PublicIpAddress === ip) {
                if (parseInt(managerInstance.State.Code) === 16) { // Running state
                    this.spinner.succeed('Manager is in a running state');
                    return managerInstance;
                } else {
                    this.spinner.fail(`Manager is not in a running state (actual state: ${managerInstance.State.Name} - ${managerInstance.State.Code})`);
                    return false;
                }
            }
        }

        return false;
    }

    async terraformShow() {
        const result = await exec('terraform show -json', {
            cwd: this.targetPath,
        });

        if (result.exitCode === 0) {
            const currentState = JSON.parse(result.stdout);
            return currentState;
        }

        return false;
    }

    terraformRefresh({ name }) {
        const tfPlanSpawn = spawn('terraform', ['refresh', '-var-file=terraform.tfvars'], {
            cwd: this.targetPath,
        });

        return this.executeTerraform(name, 'tf-refresh', tfPlanSpawn, () => { });
    }

    async detachElasticIP() {
        const detachResult = await exec('terraform state rm aws_eip.eip_manager', {
            cwd: this.targetPath,
        });

        if (detachResult.exitCode !== 0) {
            this.spinner.fail();
            console.log('');
            console.log('');
            console.log(detachResult.stderr);

            throw detachResult;
        }
    }

    async detachEFS() {
        const detachResult = await exec('terraform state rm aws_efs_file_system.block_storage', {
            cwd: this.targetPath,
        });

        if (detachResult.exitCode !== 0) {
            this.spinner.fail();
            console.log('');
            console.log('');
            console.log(detachResult.stderr);

            throw detachResult;
        }
    }

    async createTerraformFolder() {
        const { exitCode } = await exec(`mkdir -p ${this.targetPath}`);

        if (exitCode !== 0) {
            throw new Error("Couldn't create execution context directory for Terraform!");
        }
    }

    init({ cloud }) {
        const { name } = cloud;
        const tfInitSpawn = spawn('terraform', ['init'], {
            cwd: this.targetPath,
        });
        return this.executeTerraform(name, 'init', tfInitSpawn);
    }

    importExistingIp({ cloud }) {
        const { ip, name } = cloud;
        const tfImportSpawn = spawn('terraform', ['import', 'aws_eip.eip_manager', ip], {
            cwd: this.targetPath,
        });
        return this.executeTerraform(name, 'import-ip', tfImportSpawn);
    }

    importExistingEFS({ cloud }) {
        const { efs, name } = cloud;
        const tfImportSpawn = spawn('terraform', ['import', 'aws_efs_file_system.block_storage', efs], {
            cwd: this.targetPath,
        });
        return this.executeTerraform(name, 'import-ip', tfImportSpawn);
    }

    parseOutputs(str) {
        return str
            .split('\n')
            .map((_item) => {
                if (_item.indexOf(' = ') === -1) {
                    return null;
                }
                /*eslint no-control-regex: 0*/
                const item = _item.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

                const outputParts = item.split(' = ');
                const key = trim(outputParts[0]);
                const value = trim(outputParts[1]);

                return {
                    key,
                    value
                };
            })
            .filter(output => output !== null);
    }

    apply({ varsObject, cloud }) {
        const { name } = cloud;
        const vars = flatMap(varsObject, (value, key) => {
            return ['-var', `${key}=${value}`];
        });
        const tfApplySpawn = spawn('terraform', ['apply', '-var-file=terraform.tfvars', '-auto-approve', ...vars], {
            cwd: this.targetPath,
        });

        let outputs = [];
        let outputsStarted = false;

        tfApplySpawn.stdout.on('data', (data) => {
            const dataAsString = data.toString();
            // Search for the public IP of the cluster manager node.
            if (dataAsString.indexOf('Outputs:') !== -1) {
                outputsStarted = true;
            }
            if (outputsStarted && dataAsString.indexOf(' = ') !== -1) {
                outputs = outputs.concat(this.parseOutputs(dataAsString));
            }
        });
        return this.executeTerraform(name, 'tf-apply', tfApplySpawn, () => outputs);
    }

    efsId() {
        try {
            return fs.readFileSync(path.join(this.targetPath, '.efs')).toString();
        } catch (e) {
            return undefined;
        }
    }

    version() {
        return execSync("terraform -version").toString().split("\n")[0].split(" v")[1];
    }

    checkSupportedVersions() {
        const supportedVersions = require(`${__dirname}/../../package.json`).supportedTerraformVersion;
        let version;

        try {
            version = this.version()
        } catch (e) {
            // ignore errors
        }

        if (!satisfies(version, supportedVersions)) {
            const v = minVersion(supportedVersions);
            throw new Error(`Terraform version mismatch: found ${version} instead of ${supportedVersions}.
You can fix it by installing tfenv (https://github.com/tfutils/tfenv) and running the following command:

tfenv install ${v && v.version} && tfenv use ${v && v.version}
`);
        }
    }
}

function log(text, name, op, stdType = 'out') {
    if (!outputs[name]) {
        outputs[name] = {
            name,
            ops: {}
        };
    }

    const element = outputs[name];

    if (op in element.ops) {
        element.ops[op][stdType].push(text);
    } else {
        element.ops[op] = {
            out: [],
            err: []
        };
        element.ops[op][stdType].push(text);
    }
}

function base64JSON(source) {
    return Buffer.from(JSON.stringify(source)).toString("base64");
}

function serializeKeys(keys) {
    return {
        ['node-address']: keys.address,
        ['node-private-key']: keys.privateKey,
    };
}

module.exports = {
    Terraform,
};
