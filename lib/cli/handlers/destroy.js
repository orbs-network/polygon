const path = require('path');

const { logRed, logGreen, getComposeFileOrFlagsHandler } = require('./../methods');
const { Nebula } = require('../../services/polygon');
const { Terraform } = require('./../../../lib/services/terraform');
const { prepareArgsForNebulaOps } = require('./common');

async function destroy({ fileMode = false, __fileDirname = '', awsProfile, sshPublicKey: _sshPublicKey,
    orbsAddress, orbsPrivateKey, region, nodeSize, nodeCount, publicIp,
    cachePath: _catchPath, name, bootstrapUrl, backend = false, ephemeralStorage = false,
    configPath: _configPath, chainVersion, ethereumEndpoint,
    ethereumTopologyContractAddress, incomingSshCidrBlocks,
    sslCertificatePath, sslPrivateKeyPath,
}) {
    const { cloud, keys } = prepareArgsForNebulaOps({
        fileMode, __fileDirname, _configPath, _sshPublicKey, _catchPath,
        chainVersion, ethereumTopologyContractAddress, sslCertificatePath, sslPrivateKeyPath,
        orbsAddress, orbsPrivateKey, awsProfile, incomingSshCidrBlocks, ethereumEndpoint,
        region, backend, nodeSize, nodeCount, bootstrapUrl, name, ephemeralStorage,
    });

    cloud.ip = publicIp;

    const terraformAdapter = new Terraform();
    terraformAdapter.setCachePath(path.join(process.cwd(), '_terraform'));

    const nebula = new Nebula({ terraformAdapter });
    nebula.setTerraformCachePath(cloud.cachePath);

    const destroyResult = await nebula.destroyNode({ cloud, keys });

    if (destroyResult.ok === true) {
        logGreen('Your node has been successfully destroyed!');
        return destroyResult;
    } else {
        logRed('Could not destroy node!');
        logRed(destroyResult.error);
        console.log('');
        logRed('If you are clueless as to why this error happened or think it\'s a bug with Nebula');
        logRed('please kindly open a GitHub issue here:');
        logRed('https://github.com/orbs-network/polygon');
        return Promise.reject(destroyResult);
    }
}

module.exports = {
    destroy: getComposeFileOrFlagsHandler(destroy)
};
