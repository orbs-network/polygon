function createOptions(yargs) {
    return yargs
        .option('file', {
            describe: 'a JSON file representing all flags here for the terminal sake!',
            alias: 'f',
            default: false
        })
        .option('name', {
            describe: 'name your node! in case non supplied defaults to a random name',
            default: ''
        })
        .option('aws-profile', {
            describe: 'which aws profile name to use when provisioning. Strongly recommended instead of AWS keys for better security',
            default: 'default'
        })
        .boolean('testnet')
        .boolean('no-ethereum')
        .option('public-ip', {
            describe: 'attach a pre-existing AWS Elastic IP to the provisioned node',
            default: false
        })
        .option('orbs-address', {
            describe: 'Orbs node address',
            default: ''
        })
        .option('orbs-private-key', {
            describe: 'Orbs node private key',
            default: ''
        })
        .option('node-count', {
            describe: 'The amount of worker nodes within your node (this nodes carry the load of operating virtual chains)',
            default: 2
        })
        .option('node-size', {
            describe: 'The worker node instance size to use',
            default: 't2.medium'
        })
        .option('region', {
            describe: 'The region to setup the node in',
            default: 'us-east-1'
        })
        .option('ssh-public-key', {
            describe: 'The path to the public key used to provision the node machines',
            default: '~/.ssh/id_rsa.pub'
        })
        .option('config-path')
        .option('chain-version')
        .option('bootstrap-url', {
            describe: 'Optional URL from which bootstrap configuration will be taken'
        })
        .option('ssl-certificate-path', {
            describe: 'SSL certificate in plain text'
        })
        .option('ssl-private-key-path', {
            describe: 'SSL private key in plain text'
        })
        .help('help');

}

module.exports = {
    createOptions,
};
