'use strict';

process.env.SERVE_OBFUSCATED_CLIENT = process.env.SERVE_OBFUSCATED_CLIENT || '1';
process.env.BUILD_CLIENT_ON_START = process.env.BUILD_CLIENT_ON_START || '1';

require('../server/server-api.js');
