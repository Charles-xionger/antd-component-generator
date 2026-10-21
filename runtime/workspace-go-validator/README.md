# Workspace Go validator

Build the pinned validator image before starting a Workspace Agent worker:

```sh
pnpm build:workspace-validator
```

The image contains only the platform's pinned Go modules. Validation runs it
with no network, a read-only root filesystem and read-only workspace source,
no Linux capabilities, bounded CPU/memory/processes, and a disposable `/tmp`.
The named `promptweb-workspace-go-cache` volume stores only compiler cache data;
it is not a source of workspace files. Generated source is restored from the
database for a specified revision and discarded after each check.
