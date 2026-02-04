#!/usr/bin/env node

// consult - AI consultation CLI (standalone command)
import { run } from '../dist/cli.js';

const args = process.argv.slice(2);
run(['consult', ...args]);
