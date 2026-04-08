# Mintlify Deployment

This repository is set up to publish the documentation site from the `docs-site/` directory.

## How deployment works

Mintlify deploys this site by connecting the repository through the Mintlify GitHub App. After the repository is connected, pushes to the configured branch deploy automatically.

Mintlify's monorepo setup expects the path to the directory that contains `docs.json`. In this project, that path is:

```text
/docs-site
```

Do not add a trailing slash.

## One-time Mintlify dashboard setup

1. Create or open the Mintlify project in the Mintlify dashboard.
2. Open `Git Settings`.
3. Install the Mintlify GitHub App for the GitHub account or organization that owns this repository.
4. Select this repository and choose the deployment branch, usually `main`.
5. Enable `Set up as monorepo`.
6. Set the docs path to `/docs-site`.
7. Save the Git settings.

After that, new pushes to the configured branch should deploy automatically.

## Local development

Run the local preview from the repository root:

```bash
npm run docs:dev
```

This starts Mintlify from `docs-site/`.

## Validation in CI

This repository includes a GitHub Actions workflow at `.github/workflows/mintlify-docs.yml`.

It runs when docs-related files change and executes:

```bash
npm run docs:validate
```

That command:

1. Re-renders Mermaid diagrams into `docs-site/images/diagrams/`
2. Runs `mint validate` from the docs directory

## Manual validation

Before pushing, you can run:

```bash
npm run docs:validate
```

## Custom domain

If you want the site on a custom domain, configure it in the Mintlify dashboard after the repository is connected and the first deployment succeeds.
