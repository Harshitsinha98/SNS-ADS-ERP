/**
 * Helper class for batched writes with automatic batch splitting
 * Firestore has a limit of 500 operations per batch
 */
export class BatchWriter {
  constructor(db, dryRun = false) {
    this.db = db;
    this.dryRun = dryRun;
    this.batch = db.batch();
    this.operationCount = 0;
    this.totalOperations = 0;
    this.batchesCommitted = 0;
  }

  set(ref, data) {
    this.batch.set(ref, data);
    this.operationCount++;
    this.totalOperations++;
    return this._checkAndCommit();
  }

  update(ref, data) {
    this.batch.update(ref, data);
    this.operationCount++;
    this.totalOperations++;
    return this._checkAndCommit();
  }

  delete(ref) {
    this.batch.delete(ref);
    this.operationCount++;
    this.totalOperations++;
    return this._checkAndCommit();
  }

  async _checkAndCommit() {
    if (this.operationCount >= 450) {
      await this.commit();
    }
  }

  async commit() {
    if (this.operationCount === 0) return;
    
    if (this.dryRun) {
      console.log(`🔍 [DRY RUN] Would commit ${this.operationCount} operations`);
      this.batch = this.db.batch();
      this.operationCount = 0;
      return;
    }

    await this.batch.commit();
    this.batchesCommitted++;
    console.log(`   Batch ${this.batchesCommitted} committed (${this.operationCount} ops)`);
    this.batch = this.db.batch();
    this.operationCount = 0;
  }

  getStats() {
    return {
      totalOperations: this.totalOperations,
      batchesCommitted: this.batchesCommitted,
    };
  }
}
