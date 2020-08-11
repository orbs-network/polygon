const path = require('path');
const chalk = require('chalk');

const { logRed, logGreen, getComposeFileOrFlagsHandler } = require('./../methods');
const { Polygon } = require('../../services/polygon');
const { Terraform } = require('./../../../lib/services/terraform');
const { prepareArgsForPolygonOps } = require('./common');

async function status({ fileMode = false, __fileDirname = '', awsProfile, sshPublicKey: _sshPublicKey,
    orbsAddress, orbsPrivateKey, region, nodeSize, nodeCount, publicIp,
    cachePath: _catchPath, name, bootstrapUrl, backend = false, ephemeralStorage = false,
    configPath: _configPath, chainVersion, ethereumEndpoint,
    ethereumTopologyContractAddress, incomingSshCidrBlocks,
    sslCertificatePath, sslPrivateKeyPath,
}) {
    const { cloud, keys } = prepareArgsForPolygonOps({
        fileMode, __fileDirname, _configPath, _sshPublicKey, _catchPath,
        chainVersion, ethereumTopologyContractAddress, sslCertificatePath, sslPrivateKeyPath,
        orbsAddress, orbsPrivateKey, awsProfile, incomingSshCidrBlocks, ethereumEndpoint,
        region, backend, nodeSize, nodeCount, bootstrapUrl, name, ephemeralStorage,
    });

    cloud.ip = publicIp;

    const terraformAdapter = new Terraform();
    terraformAdapter.setCachePath(path.join(process.cwd(), '_terraform'));

    const polygon = new Polygon({ terraformAdapter });
    polygon.setTerraformCachePath(cloud.cachePath);

    const statusResult = await polygon.status({ cloud, keys });

    if (statusResult === false) {
        console.log(chalk.yellow('polygon create was never run, please run it at least once to inspect for status'));
        process.exit(0);
    }

    if (statusResult.resourcesToAdd > 0 && statusResult.resourcesToAdd < 20) {
        if (statusResult.resourcesToDestroy > 0 && statusResult.resourcesToDestroy < 20) {
            logGreen('Your node is live on AWS');
        }
    } else if (statusResult.resourcesToAdd > 40) {
        logRed('Your node has not been setup, please run polygon create to set it up on AWS');
    }

    process.exit(0);
}

module.exports = {
    status: getComposeFileOrFlagsHandler(status)
};
