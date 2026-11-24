import { describe, expect, test } from 'vitest';
import registerPetstoreSuite from '../../shared/petstore-suite.cjs';

registerPetstoreSuite({ describe, test, expect });
