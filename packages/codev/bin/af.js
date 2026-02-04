#!/usr/bin/env node

// af - Agent Farm CLI (standalone command)
// Routes to agent-farm command handler
import { run } from '../dist/cli.js';

const args = process.argv.slice(2);
run(['agent-farm', ...args]);
