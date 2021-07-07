const { create } = require('./handlers/create');
const { destroy } = require('./handlers/destroy');
const { status } = require('./handlers/status');

module.exports = {
    create,
    destroy,
    status,
};
