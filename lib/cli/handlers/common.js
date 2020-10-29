const types = require('./../../../constants/types');
const { resolvePath } = require("../../utils/resolve-path");
const _ = require('lodash');

module.exports = {
    prepareArgsForPolygonOps({
        fileMode, __fileDirname, _sshPublicKey, _catchPath,
        ethereumTopologyContractAddress, sslCertificatePath, sslPrivateKeyPath,
        orbsAddress, orbsPrivateKey, awsProfile, incomingSshCidrBlocks, ethereumEndpoint,
        region, backend, nodeSize, nodeCount, bootstrapUrl, name, managementConfig, ephemeralStorage,
        boyarTargetUrl, boyarAutoUpdate,
    }) {
        let sshPublicKey = _sshPublicKey;
        let cachePath = _catchPath;

        // Expand cache path
        if (cachePath !== undefined) {
            cachePath = resolvePath(cachePath, fileMode ? __fileDirname : process.cwd());
        } else {
            cachePath = resolvePath("~/.polygon");
        }

        // Expand SSH public key path
        if (fileMode) {
            sshPublicKey = resolvePath(sshPublicKey, __fileDirname);
        }

        if (!_.isEmpty(sslCertificatePath)) {
            sslCertificatePath = resolvePath(sslCertificatePath, __fileDirname);
        }

        if (!_.isEmpty(sslPrivateKeyPath)) {
            sslPrivateKeyPath = resolvePath(sslPrivateKeyPath, __fileDirname);
        }

        const keys = {
            aws: {
                profile: awsProfile,
            },
            ssh: {
                path: sshPublicKey,
                cidr: incomingSshCidrBlocks,
            },
            orbs: {
                nodeKeys: {
                    address: orbsAddress,
                    privateKey: orbsPrivateKey,
                },
                ethereumTopologyContractAddress,
                ethereumEndpoint,
            },
            ssl: {
                sslCertificatePath,
                sslPrivateKeyPath,
            }
        };

        const cloud = {
            type: types.clouds.aws,
            region,
            backend,
            boyarTargetUrl,
            boyarAutoUpdate,
            ephemeralStorage,
            instanceType: nodeSize,
            nodeCount: nodeCount,
            bootstrapUrl,
            cachePath,
            managementConfig,
        };

        if (name !== '' && name.length > 0) {
            cloud.name = name;
        }

        return {
            cloud,
            keys,
        };
    }
};