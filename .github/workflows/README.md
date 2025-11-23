## CI Workflows

### ci.yml

Unified CI/CD workflow that runs tests and builds both backend and frontend images.

**Triggers:**
- Push to `master` branch
- Pull requests to `master` (tests run, images built but not pushed)
- Version tags (e.g., `v1.0.0`)
- Manual workflow dispatch

**What it does:**
1. **Test Job**: Runs both frontend and backend tests
2. **Build Jobs**: After tests pass, builds both images in parallel:
   - Backend image: `ghcr.io/<username>/<repo>/backend:<tag>`
   - Frontend image: `ghcr.io/<username>/<repo>/frontend:<tag>`

**Configuration:**
- Uses `VITE_API_URL` repository variable (if set) or defaults to `http://localhost:8000`
- Can be configured in repository settings under Variables

## Image Tagging Strategy

Images are tagged with multiple strategies:

1. **Branch name** - For branch pushes (e.g., `master`, `develop`)
2. **PR number** - For pull requests (e.g., `pr-123`)
3. **Semantic version** - For version tags (e.g., `v1.0.0`, `1.0`, `1`)
4. **Git SHA** - For commit-specific builds (e.g., `master-abc1234`)
5. **Latest** - Only for the default branch (`master`)

### Example Tags

For a commit `abc1234` on `master` with tag `v1.0.0`:

- `latest`
- `master`
- `master-abc1234`
- `v1.0.0`
- `1.0.0`
- `1.0`
- `1`

## Registry Access

### Authentication

Images are pushed using the `GITHUB_TOKEN` which is automatically provided by GitHub Actions. No additional secrets are required.

### Image Visibility

Images are private by default. To make them public:

1. Go to the package page on GitHub
2. Click "Package settings"
3. Scroll to "Danger Zone"
4. Click "Change visibility" and select "Public"

Alternatively, set visibility in the repository settings under "Packages".

### Pulling Images

To pull images, you need to authenticate:

```bash
echo $GITHUB_TOKEN | podman login ghcr.io -u USERNAME --password-stdin
podman pull ghcr.io/<username>/<repo>/backend:latest
```

For public images, authentication is not required.

## Repository Variables

You can configure build behavior using repository variables:

- `VITE_API_URL` - API URL used when building the frontend (default: `http://localhost:8000`)

Set variables in: Repository Settings → Secrets and variables → Actions → Variables

## Manual Builds

To trigger a manual build:

1. Go to the "Actions" tab in GitHub
2. Select the workflow you want to run
3. Click "Run workflow"
4. Choose the branch and click "Run workflow"

## Build Cache

Workflows use GitHub Actions cache to speed up builds:

- Docker layer caching via `cache-from` and `cache-to`
- Cache is shared across workflow runs
- Cache is automatically invalidated when Dockerfiles or dependencies change

## Troubleshooting

### Build Failures

1. Check the workflow logs in the "Actions" tab
2. Verify Dockerfile syntax
3. Ensure all required files are present in the repository

### Permission Issues

Ensure the workflow has the correct permissions:
- `contents: read` - To checkout code
- `packages: write` - To push images to ghcr.io

These are set in each workflow file under `permissions`.

### Image Not Found

1. Verify the image name matches your repository
2. Check if the image is private (requires authentication)
3. Ensure the workflow completed successfully

