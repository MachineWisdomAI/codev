/**
 * Regression tests for Bugfix #195
 *
 * af attach fails for builders with broken SQLite records (port 0, status spawning)
 *
 * Tests cover:
 * 1. Multiple PTY-backed builders (port=0) can coexist without UNIQUE constraint violation
 * 2. Migration v4 removes UNIQUE constraint from builders.port
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { LOCAL_SCHEMA } from '../db/schema.js';

const testDir = resolve(process.cwd(), '.test-bugfix-195');
let db: Database.Database;

describe('Bugfix #195: port=0 builders and status lifecycle', () => {
  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null as any;
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('Schema: builders.port no longer UNIQUE', () => {
    it('should allow multiple builders with port=0', () => {
      const dbPath = resolve(testDir, 'state.db');
      db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.exec(LOCAL_SCHEMA);

      const insertBuilder = db.prepare(`
        INSERT INTO builders (id, name, port, pid, status, phase, worktree, branch, type, terminal_id)
        VALUES (@id, @name, @port, @pid, @status, @phase, @worktree, @branch, @type, @terminalId)
      `);

      // Insert first PTY-backed builder (port=0, pid=0)
      insertBuilder.run({
        id: 'task-AAAA',
        name: 'Task: First builder',
        port: 0,
        pid: 0,
        status: 'implementing',
        phase: 'init',
        worktree: '/tmp/worktree-1',
        branch: 'builder/task-AAAA',
        type: 'task',
        terminalId: 'term-001',
      });

      // Insert second PTY-backed builder (also port=0, pid=0) — this was the crash
      insertBuilder.run({
        id: 'bugfix-42',
        name: 'Bugfix #42',
        port: 0,
        pid: 0,
        status: 'implementing',
        phase: 'init',
        worktree: '/tmp/worktree-2',
        branch: 'builder/bugfix-42',
        type: 'bugfix',
        terminalId: 'term-002',
      });

      // Insert third builder with a real port (should also work)
      insertBuilder.run({
        id: '0073',
        name: '0073-feature',
        port: 4210,
        pid: 12345,
        status: 'implementing',
        phase: 'init',
        worktree: '/tmp/worktree-3',
        branch: 'builder/0073-feature',
        type: 'spec',
        terminalId: null,
      });

      const count = db.prepare('SELECT COUNT(*) as count FROM builders').get() as { count: number };
      expect(count.count).toBe(3);

      // Verify all builders are retrievable
      const builders = db.prepare('SELECT id, port FROM builders ORDER BY id').all() as Array<{ id: string; port: number }>;
      expect(builders).toEqual([
        { id: '0073', port: 4210 },
        { id: 'bugfix-42', port: 0 },
        { id: 'task-AAAA', port: 0 },
      ]);
    });

    it('schema should not contain UNIQUE on builders.port', () => {
      const dbPath = resolve(testDir, 'state.db');
      db = new Database(dbPath);
      db.exec(LOCAL_SCHEMA);

      const tableInfo = db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='builders'")
        .get() as { sql: string };

      expect(tableInfo.sql).not.toContain('port INTEGER NOT NULL UNIQUE');
      expect(tableInfo.sql).toContain('port INTEGER NOT NULL DEFAULT 0');
    });
  });

  describe('Migration v4: remove UNIQUE from builders.port', () => {
    it('should migrate old schema with UNIQUE constraint', () => {
      const dbPath = resolve(testDir, 'state.db');
      db = new Database(dbPath);
      db.pragma('journal_mode = WAL');

      // Create old schema with UNIQUE constraint on port
      db.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS builders (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          port INTEGER NOT NULL UNIQUE,
          pid INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'spawning'
            CHECK(status IN ('spawning', 'implementing', 'blocked', 'pr-ready', 'complete')),
          phase TEXT NOT NULL DEFAULT '',
          worktree TEXT NOT NULL,
          branch TEXT NOT NULL,
          tmux_session TEXT,
          type TEXT NOT NULL DEFAULT 'spec'
            CHECK(type IN ('spec', 'task', 'protocol', 'shell', 'worktree', 'bugfix')),
          task_text TEXT,
          protocol_name TEXT,
          issue_number INTEGER,
          terminal_id TEXT,
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO _migrations (version) VALUES (1);
        INSERT INTO _migrations (version) VALUES (2);
        INSERT INTO _migrations (version) VALUES (3);
      `);

      // Insert a builder with the old schema
      db.prepare(`
        INSERT INTO builders (id, name, port, pid, worktree, branch)
        VALUES ('existing', 'Old builder', 4210, 1234, '/tmp', 'branch')
      `).run();

      // Verify UNIQUE constraint exists before migration
      const oldInfo = db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='builders'")
        .get() as { sql: string };
      expect(oldInfo.sql).toContain('port INTEGER NOT NULL UNIQUE');

      // Run migration v4 (same logic as in db/index.ts)
      const v4 = db.prepare('SELECT version FROM _migrations WHERE version = 4').get();
      if (!v4) {
        const tableInfo = db
          .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='builders'")
          .get() as { sql: string } | undefined;

        if (tableInfo?.sql?.includes('port INTEGER NOT NULL UNIQUE')) {
          db.exec(`
            CREATE TABLE builders_new (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              port INTEGER NOT NULL DEFAULT 0,
              pid INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'spawning'
                CHECK(status IN ('spawning', 'implementing', 'blocked', 'pr-ready', 'complete')),
              phase TEXT NOT NULL DEFAULT '',
              worktree TEXT NOT NULL,
              branch TEXT NOT NULL,
              tmux_session TEXT,
              type TEXT NOT NULL DEFAULT 'spec'
                CHECK(type IN ('spec', 'task', 'protocol', 'shell', 'worktree', 'bugfix')),
              task_text TEXT,
              protocol_name TEXT,
              issue_number INTEGER,
              terminal_id TEXT,
              started_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO builders_new SELECT * FROM builders;
            DROP TABLE builders;
            ALTER TABLE builders_new RENAME TO builders;
          `);
        }
        db.prepare('INSERT INTO _migrations (version) VALUES (4)').run();
      }

      // Verify UNIQUE constraint is gone
      const newInfo = db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='builders'")
        .get() as { sql: string };
      expect(newInfo.sql).not.toContain('port INTEGER NOT NULL UNIQUE');

      // Verify existing data preserved
      const existing = db.prepare('SELECT * FROM builders WHERE id = ?').get('existing') as any;
      expect(existing.port).toBe(4210);
      expect(existing.name).toBe('Old builder');

      // Verify multiple port=0 inserts now work
      db.prepare(`
        INSERT INTO builders (id, name, port, pid, worktree, branch)
        VALUES ('new-1', 'New 1', 0, 0, '/tmp/1', 'b1')
      `).run();
      db.prepare(`
        INSERT INTO builders (id, name, port, pid, worktree, branch)
        VALUES ('new-2', 'New 2', 0, 0, '/tmp/2', 'b2')
      `).run();

      const count = db.prepare('SELECT COUNT(*) as count FROM builders').get() as { count: number };
      expect(count.count).toBe(3);
    });
  });
});
