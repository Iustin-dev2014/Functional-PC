# Ubuntu session snapshots

Place **exactly one** exported `.zip` snapshot in this folder to restore it on the next Temporary Browser VM run.

1. Download the `ubuntu-session-save-...` artifact from a completed run.
2. Upload the ZIP here (do not unzip it) and commit it.
3. Start the workflow. It validates the ZIP and its SHA-256 manifest before restoring.
4. After a successful import, the workflow removes the consumed ZIP from this folder automatically. Invalid snapshots are retained for repair.

**Privacy warning:** this repository may be public. Never commit a snapshot containing private documents, passwords, access tokens, or other sensitive data. Snapshot archives intentionally exclude common credential folders and caches, but you should still inspect the contents before uploading. Keep exactly one ZIP in this folder.
