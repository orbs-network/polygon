const { prepareArgsForPolygonOps } = require('./common');
const { logRed, logGreen, ValidateIPaddress, getComposeFileOrFlagsHandler, } = require('./../methods');

const path = require('path');
const { Polygon, boyarDefaultVersion } = require('../../services/polygon');
const { Terraform } = require('./../../../lib/services/terraform');
const { trim } = require('lodash');

const elliptic = require('elliptic');
const { keccak256 } = require('js-sha3');
const { encodeHex, decodeHex } = require('orbs-client-sdk');

function _create({ fileMode = false, __fileDirname = '', awsProfile, sshPublicKey: _sshPublicKey,
    orbsAddress, orbsPrivateKey, region, nodeSize, publicIp, nodeCount,
    cachePath: _catchPath, name, bootstrapUrl, backend = false, ephemeralStorage = false,
    ethereumEndpoint,
    ethereumTopologyContractAddress, incomingSshCidrBlocks,
    sslCertificatePath, sslPrivateKeyPath,
    managementConfig,
    boyarVersion = boyarDefaultVersion, _boyarUrl = '', _boyarCommit = '',
}) {
    let errorMessage,
        boyarTargetUrl = '';
    const baseBoyarURL = `https://s3.amazonaws.com/orbs-network-releases/infrastructure/boyar/boyar-${boyarVersion}.bin`;

    if (trim(_boyarUrl).length > 0) {
        // Only for the Orbs dev team to install a specific Boyar binary
        boyarTargetUrl = _boyarUrl;
    } else if (_boyarCommit.length > 0) {
        // Only for the Orbs dev team to install a specific Boyar binary
        boyarTargetUrl = `https://s3.amazonaws.com/boyar-dev-releases/boyar/boyar-${_boyarCommit}.bin`;
    } else {
        boyarTargetUrl = baseBoyarURL;
    }

    if (orbsAddress.length !== 40) {
        errorMessage = `Invalid Orbs node address, required hex of 40 characters
Got: ${orbsAddress} (Length: ${orbsAddress.length})
`;
        logRed(errorMessage);
        throw new Error(errorMessage);
    }

    if (orbsPrivateKey.length !== 64) {
        errorMessage = `Invalid Orbs private key, required hex of 64 characters
Got: ${orbsPrivateKey} (Length: ${orbsPrivateKey.length})`;
        logRed(errorMessage);
        throw new Error(errorMessage);
    }

    const params = prepareArgsForPolygonOps({
        fileMode, __fileDirname, _sshPublicKey, _catchPath,
        ethereumTopologyContractAddress, sslCertificatePath, sslPrivateKeyPath,
        orbsAddress, orbsPrivateKey, awsProfile, incomingSshCidrBlocks, ethereumEndpoint,
        region, backend, nodeSize, nodeCount, bootstrapUrl, name, managementConfig,
        ephemeralStorage, boyarTargetUrl,
    });

    if (publicIp !== false && publicIp !== '') {
        if (ValidateIPaddress(publicIp)) {
            params.cloud.ip = publicIp;
        } else {
            errorMessage = `The supplied IP address ${publicIp}
            is not a valid IPv4 address!`;
            logRed(errorMessage);
            throw new Error(errorMessage);
        }
    }

    return params;
}

async function create(params) {
    const { keys, cloud } = _create(params);

    const terraformAdapter = new Terraform();
    terraformAdapter.setCachePath(path.join(process.cwd(), '_terraform'));

    const polygon = new Polygon({ terraformAdapter });
    polygon.setTerraformCachePath(cloud.cachePath);
    try {
        const result = await polygon.createNode({ cloud, keys });
        const managerIP = ('ip' in cloud) ? cloud.ip : result.manager.ip;

        logGreen('Your node was created successfully!');
        logGreen("Provided below is the address of your manager node public IP");
        logGreen(`The manager IPv4 is: ${managerIP}`);
        console.log('');
        logGreen('Your node name should be used when wanting to destroy/upgrade');
        logGreen('Node name:');
        logGreen(result.name);
        console.log('');
        console.log('Example usage:');

        if (params.fileMode) {
            console.log(`polygon destroy -f ${params._file}`);
        } else {
            console.log(`polygon destroy --name ${result.name}`);
        }

        console.log('');
        logGreen('Please allow time now for your node to finish syncing with the Orbs network');
        logGreen('No further actions required at this point');

        return result;
    } catch (err) {

        logRed('Your constelation was not created successfully!');
        logRed(`with error message as follows: ${err.message}`);
        logRed('Please follow the inline messages from Terraform to find out why');

        if ('tfPath' in err) {
            console.log('');
            logRed('More information on debugging errors can be found by running the same commands');
            logRed('that Polygon runs within your compiled Terraform infrastructure folder located at:');
            logRed(err.tfPath);
        }

        console.log('');
        logRed('If you are clueless as to why this error happened or think it\'s a bug with Polygon');
        logRed('please kindly open a GitHub issue here: ');
        logRed('https://github.com/orbs-network/polygon');

        throw err;
    }
}

function calcNodeAddressFromPublicKey(publicKey) {
    return encodeHex(new Uint8Array(keccak256.digest(publicKey).slice(12)))
}

function _verifyKeys({ orbsAddress, orbsPrivateKey }) {
    const ec = new elliptic.ec('secp256k1');
    const keyPair = ec.keyFromPrivate(decodeHex(orbsPrivateKey));
    const  publicKey = new Uint8Array(keyPair.getPublic("array")).slice(1);

    const nodeAddress = calcNodeAddressFromPublicKey(publicKey);
    return nodeAddress.toLowerCase() == orbsAddress.toLowerCase();
}

module.exports = {
    create: getComposeFileOrFlagsHandler(create),
    _create: _create,
    _verifyKeys,
};
