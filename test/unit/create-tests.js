const { describe, it } = require('mocha');
const chai = require('chai');
const asserttype = require('chai-asserttype');
chai.use(asserttype);

const { expect } = chai;

const { _create, _verifyKeys } = require("../../lib/cli/handlers/create");
const { boyarDefaultVersion } = require("../../lib/services/polygon");

describe('_create', () => {
    it('generates keys and cloud objects from input', () => {
        const { keys, cloud } = _create({
            "name": "mumbai-node4",
            "awsProfile": "default",
            "sshPublicKey": "~/.ssh/id_rsa.pub",
            "orbsAddress": "54018092153dcdea764f89d33b086c7114e11985",
            "orbsPrivateKey": "1e4c067360dd8b81db5de2609783c505f61f239cd970195d00165dd9e4df774b",
            "publicIp": "52.66.33.249",
            "region": "ap-south-1",
            "nodeSize": "m4.large",
            "nodeCount": 0,
            "ethereumTopologyContractAddress": "0xa8Ef7740D85B1c0c22E39aae896e829Af7c895A5",
            "ethereumEndpoint": "http://eth.orbs.com",
            "incomingSshCidrBlocks": ["0.0.0.0/0"],
            "bootstrapUrl": "http://localhost:7666/node/management",
            "cachePath": "../terraform",
            "managementConfig": {
                "services": {
                    "management-service": {
                        "DockerConfig": {
                            "Image":  "orbsnetwork/management-service",
                            "Tag":    "G-0-N",
                            "Pull":   true
                        }
                    }
                }
            },

            // pretend we're in file mode
            "fileMode": true,
            "__fileDirname": __dirname,
        });

        expect(cloud).to.deep.equal({
            "type": "aws",
            "region": "ap-south-1",
            "instanceType": "m4.large",
            "backend": false,
            "nodeCount": 0,
            "name": "mumbai-node4",
            "ip": "52.66.33.249",
            "ephemeralStorage": false,
            "bootstrapUrl": "http://localhost:7666/node/management",
            "boyarTargetUrl": `https://github.com/orbs-network/boyarin/releases/download/${boyarDefaultVersion}/boyar-${boyarDefaultVersion}.bin`,
            "boyarAutoUpdate": false,
            "cachePath": process.cwd() + "/test/terraform",
            "managementConfig": {
                "services": {
                    "management-service": {
                        "DockerConfig": {
                            "Image":  "orbsnetwork/management-service",
                            "Tag":    "G-0-N",
                            "Pull":   true
                        }
                    }
                }
            },
          });

        expect(keys.aws).to.deep.equal({
            "profile": "default"
        });

        expect(keys.ssh).to.deep.equal({
            "path": `${process.env.HOME}/.ssh/id_rsa.pub`,
            "cidr": ["0.0.0.0/0"],
        });

        expect(keys.orbs.nodeKeys).to.deep.equal({
            "address": "54018092153dcdea764f89d33b086c7114e11985",
            "privateKey": "1e4c067360dd8b81db5de2609783c505f61f239cd970195d00165dd9e4df774b"
        });

        expect(keys.orbs.ethereumEndpoint).to.be.equal("http://eth.orbs.com");
        expect(keys.orbs.ethereumTopologyContractAddress).to.be.equal("0xa8Ef7740D85B1c0c22E39aae896e829Af7c895A5");
    });
});

describe("_verifyKeys", () => {
    it("verifies that orbsPublicAddresss matches the private key", () => {
        const account = {
            "NodePrivateKey": "933e098E851949bC34425aF87DDeAF4Ba959B029709a581b95D13982578B75Ac".toLowerCase(),
            "NodePublicKey": "37578D502d749Df8F02f6ce8D1ce6F3c659D19B56eE1c140cdc13d966418446C536c064329a50Ad21D59f31b6d216A610F93829A131fc5B66c3712d900689219".toLowerCase(),
            "NodeAddress": "d72Db29E8511D94b016Df341B8EE4d3809CF09eE".toLowerCase()
        }
          
        expect(_verifyKeys({
            orbsAddress: account.NodeAddress,
            orbsPrivateKey: account.NodePrivateKey,
        })).to.be.true;

        expect(_verifyKeys({
            orbsAddress: "0000b29E8511D94b016Df341B8EE4d3809CF09eE".toLowerCase(),
            orbsPrivateKey: account.NodePrivateKey,
        })).to.be.false;
    });
})
