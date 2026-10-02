# Privacy

IAF Agent Bridge runs on your machine. It does not operate a hosted service and it does not have an account of its own.

The MCP client sends prompts to this process. This process sends those prompts to the local Cursor CLI. Cursor's own service receives what the Cursor CLI sends, under Cursor's terms and privacy policy.

The bridge stores session ids only in memory for the life of the process. It does not write prompts, replies, or credentials to a database.

`doctor` reports whether the Cursor CLI is authenticated. It does not record the account email, user id, or tokens.

Do not put secrets in prompts. The bridge redacts common token shapes in its own logs, and logs go to stderr.
