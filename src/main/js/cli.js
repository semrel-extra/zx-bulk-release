#!/usr/bin/env node

import {argv} from 'zx-extra'
import {run} from './index.js'
import {normalizeFlags} from './config.js';

run({flags: normalizeFlags(argv)})
