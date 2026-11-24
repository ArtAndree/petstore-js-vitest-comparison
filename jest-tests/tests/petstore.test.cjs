const { describe, test, expect } = require('@jest/globals');
const registerPetstoreSuite = require('../../shared/petstore-suite.cjs');

registerPetstoreSuite({ describe, test, expect });
