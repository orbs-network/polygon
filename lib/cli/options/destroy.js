function destroyOptions(yargs) {
    return yargs
        .option('file', {
            describe: 'a JSON file representing all flags here for the terminal sake!',
            alias: 'f',
            default: undefined
        })
        .option('name', {
            describe: 'the name you used or were provided with when you created your node',
            default: '',
        })
        .usage('nebula destroy --name [your-node-name]')
        .demandOption('name')
        .help('help');
}

module.exports = {
    destroyOptions,
};