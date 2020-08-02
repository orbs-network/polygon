const _ = require('lodash');
const { trim } = _;
const { exec: _exec } = require('child-process-promise');
const path = require('path');
const fs = require('fs');
const util = require('util');
const writeFile = util.promisify(fs.writeFile);
const unlink = util.promisify(fs.unlink);
const fetch = require('node-fetch');
const net = require('net');

const AWS = require('aws-sdk');
const uuid = require('uuid');

const fixtures = require('./fixtures/nodes.json');
const boyar = require('./fixtures/boyar.json');
const { expect } = require('chai');

async function exec(cmd, opts) {
    console.log('[exec-call] $ ', cmd, opts);
    let result;

    try {
        // Contain fails within exec
        result = await _exec(cmd, opts);
    } catch (err) {
        result = {
            stderr: err,
            stdout: '',
            childProcess: {
                exitCode: 9,
            },
        };
    }

    console.log('exit code: ', result.childProcess.exitCode);
    console.log('stdout: ', result.stdout);
    console.log('stderr: ', result.stderr);

    result.exitCode = result.childProcess.exitCode;

    return result;
}

function circleCiBuildNumber() {
    return process.env.CIRCLE_BUILD_NUM || uuid().split('-')[1];
}

function generateIpsConfig(nodes) {
    return _.reduce(nodes, (result, node) => {
        return _.merge(result, {
            [node.name]: node.publicIp
        });
    }, {});
}

function generateKeysConfig(nodes) {
    return _.reduce(nodes, (result, node) => {
        return _.merge(result, {
            [node.name]: {
                address: node.orbsAddress,
            }
        });
    }, {});
}

async function assertVChainIsUp({ ip, id, gossip, address }) {
    // Perform checks
    console.log('Investigating vchain', id);
    await assertGossipPortIsReachable(gossip, { host: ip });

    await assertVchainHasMetrics({ ip, id, address });
}

function assertGossipPortIsReachable(port, { timeout = 1000, host } = {}) {
    return new Promise(((resolve, reject) => {
        console.log(`attempting to connect to: ${host}:${port}`);
        const s = new net.Socket();

        s.setTimeout(timeout);
        s.once('error', reject);
        s.once('timeout', () => reject(new Error("Operation has timed out")));

        s.connect(port, host, () => {
            s.end();
            console.log(`${host}:${port} is reachable using tcp!`);
            resolve();
        });
    }));
}

async function assertVchainHasMetrics({ ip, id, /*address*/ }) {
    const metricsUrl = `http://${ip}/vchains/${id}/metrics`;
    console.log(`calling ${metricsUrl}`);
    const result = await fetch(metricsUrl);

    expect(result.status).to.equal(200);
    expect(result.headers.get('content-type')).to.contain('application/json');

    const metrics = await result.json();

    //expect(metrics["Node.Address"]).to.equal(address, "Node address is different than expected");
    expect(metrics["Version.Semantic"], "semver").to.match(/^[vV]/);
}

module.exports = {
    exec,
    fixtures,
    writeNodesJSONsToDisc(jsons) {
        return Promise.all(jsons.map((json, index) => {
            const targetPath = path.join(__dirname, 'private-network/nodes', `node${index + 1}.json`);
            return writeFile(targetPath, JSON.stringify(json, 2, 2));
        }));
    },
    deleteNodesJSONsFromDisk(jsons) {
        return Promise.all(jsons.map((_, index) => unlink(path.join(__dirname, 'private-network/nodes', `node${index + 1}.json`))));
    },
    getElasticIPsInRegions(regions) {
        return Promise.all(regions.map(async (region) => ({ region, ip: await this.aws.getPublicIp(region) })));
    },
    writeBoyarConfig() {
        const targetPath = path.join(__dirname, 'private-network/templates/boyar.json');
        return fs.writeFileSync(targetPath, JSON.stringify(boyar, 2, 2));
    },
    writeConfigurationFiles(nodes) {
        this.writeBoyarConfig();

        const basePath = path.join(__dirname, 'private-network/templates');
        const ipsTargetPath = path.join(basePath, 'ips.json');
        const keysTargetPath = path.join(basePath, 'keys.json');

        console.log('about to write IPs and Keys: ', nodes);

        fs.writeFileSync(ipsTargetPath, JSON.stringify(generateIpsConfig(nodes), 2, 2));
        fs.writeFileSync(keysTargetPath, JSON.stringify(generateKeysConfig(nodes), 2, 2));
    },
    aws: {
        async getPublicIp(region) {
            const ec2 = new AWS.EC2({
                region
            });

            const response = await ec2.allocateAddress({
                Domain: 'vpc'
            }).promise();

            return response.PublicIp;
        },
        async destroyPublicIp(region, ip) {
            console.log(`Attempting to destroy ${ip} in ${region}`);

            const ec2 = new AWS.EC2({
                region,
            });

            const description = await ec2.describeAddresses({
                PublicIps: [ip],
            }).promise();

            console.log(`ips allocated within region ${region}:`);
            console.log(description.Addresses);

            const result = await ec2.releaseAddress({
                AllocationId: description.Addresses[0].AllocationId
            }).promise();

            return {
                region,
                ip,
                result,
            };
        }
    },
    getNodesJSONs({ elasticIPs, buildNumber = circleCiBuildNumber() }, nodes = fixtures.nodes) {
        const commonProps = {
            sshPublicKey: '~/.ssh/id_rsa.pub',
            configPath: '../templates',
            incomingSshCidrBlocks: ["0.0.0.0/0"],
            awsProfile: 'default',
            nodeSize: 't2.medium',
            ephemeralStorage: true,
            nodeCount: 0,
        };

        const regionIndexes = {};

        return nodes.map((node) => {
            let currentRegionIndex = 0;
            if (node.region in regionIndexes) {
                currentRegionIndex = regionIndexes[node.region];
                currentRegionIndex++;
                regionIndexes[node.region] = currentRegionIndex;
            } else {
                regionIndexes[node.region] = currentRegionIndex;
            }

            const { ip: publicIp } = elasticIPs
                .filter(({ region }) => region === node.region)[currentRegionIndex];

            node.name = node.name.replace('{circle_ci_build_number}', buildNumber);

            return Object.assign({}, node, commonProps, {
                publicIp
            });
        });
    },
    async clenaupTerraformProjectFromOlderRuns({ basePath, dirName }) {
        const currentProjectPath = path.join(basePath, dirName);
        await exec(`rm -rf ${currentProjectPath}; rm -rf ${currentProjectPath}-aside`);
    },
    cleanUpTerraformProject({ basePath, dirName, shouldCleanup }) {
        if (shouldCleanup) {
            const currentProjectPath = path.join(basePath, dirName);
            console.log(`Cleaning up Terraform project at path: ${currentProjectPath}`);
            return exec(`cd ${currentProjectPath} && terraform destroy -var-file terraform.tfvars -auto-approve`);
        }

        return Promise.resolve();
    },
    async renameTerraformProjectToAside({ basePath, dirName }) {
        const currentProjectPath = path.join(basePath, dirName);
        console.log(`Renaming the Terraform folder ${currentProjectPath} to ${currentProjectPath}-aside`);
        const result = await exec(`rm -rf ${currentProjectPath}-aside && mv ${currentProjectPath} ${currentProjectPath}-aside`);
        if (result.exitCode !== 0) {
            throw new Error(`The following exec failed: "rm -rf ${currentProjectPath}-aside && mv ${currentProjectPath} ${currentProjectPath}-aside"`);
        }

        return Promise.resolve();
    },
    remoteExec({ command, ip }) {
        return exec(`ssh -o StrictHostKeyChecking=no ubuntu@${ip} '${command}'`);
    },
    async eventuallyReady({ ip, boyar, address }) {
        let pollCount = 0;

        let lastError = new Error('Did not run once');

        while (lastError !== null && pollCount < 60) {
            try {
                console.log(`polling the cluster deployed service... [${pollCount}]`);
                console.log('IP: ', ip);

                // We test to see that Boyar is available in this manger node.
                const boyarCheck = await exec(`ssh -o StrictHostKeyChecking=no ubuntu@${ip} 'test -e /usr/bin/boyar'`);
                expect(boyarCheck.exitCode).to.equal(0);

                const swarmLeaderCheck = await exec(`ssh -o StrictHostKeyChecking=no ubuntu@${ip} 'sudo docker node ls | grep Leader | wc -l'`);
                expect(trim(swarmLeaderCheck.stdout)).to.equal('1');

                for (let chain of boyar.chains) {
                    await assertVChainIsUp({
                        id: chain.Id,
                        ip,
                        gossip: chain.ExternalPort,
                        address,
                    });
                }

                lastError = null;
            } catch (err) {
                lastError = err;
                console.log('the last error from our loop:', lastError);
                pollCount++;
                await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
            }
        }

        if (lastError !== null) {
            throw lastError;
        }
    },
};
