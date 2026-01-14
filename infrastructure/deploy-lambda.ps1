# deploy-lambda.ps1
# Deploys the Media Compression Lambda with updated thumbnail resolution
#
# Prerequisites:
# - AWS CLI configured with appropriate credentials
# - Node.js 20+ installed
# - pnpm installed
#
# Usage:
#   .\deploy-lambda.ps1              # Deploy Lambda
#   .\deploy-lambda.ps1 -DryRun      # Preview changes without deploying
#   .\deploy-lambda.ps1 -SkipBuild   # Deploy without rebuilding Lambda

param(
    [switch]$DryRun,
    [switch]$SkipBuild,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Error($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InfraDir = $ScriptDir
$LambdaDir = Join-Path $InfraDir "lambda\media-compression"

Write-Info "=========================================="
Write-Info "Media Compression Lambda Deployment"
Write-Info "=========================================="

if ($DryRun) {
    Write-Warn "DRY RUN MODE - No changes will be deployed"
}

# Step 1: Verify environment
Write-Info "Checking prerequisites..."

# Check AWS CLI
try {
    $awsVersion = aws --version
    Write-Success "AWS CLI: $awsVersion"
} catch {
    Write-Error "AWS CLI not found. Please install and configure AWS CLI."
    exit 1
}

# Check AWS credentials
try {
    $identity = aws sts get-caller-identity --output json | ConvertFrom-Json
    Write-Success "AWS Account: $($identity.Account)"
    Write-Success "AWS User: $($identity.Arn)"
} catch {
    Write-Error "AWS credentials not configured. Run 'aws configure' first."
    exit 1
}

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Success "Node.js: $nodeVersion"
} catch {
    Write-Error "Node.js not found. Please install Node.js 20+."
    exit 1
}

# Step 2: Install dependencies
Write-Info "Installing dependencies..."

Push-Location $InfraDir
try {
    if (Test-Path "pnpm-lock.yaml") {
        pnpm install --frozen-lockfile
    } elseif (Test-Path "package-lock.json") {
        npm ci
    } else {
        npm install
    }
    Write-Success "Infrastructure dependencies installed"
} catch {
    Write-Error "Failed to install infrastructure dependencies: $_"
    exit 1
}
Pop-Location

# Step 3: Build Lambda
if (-not $SkipBuild) {
    Write-Info "Building Lambda function..."
    
    Push-Location $LambdaDir
    try {
        if (Test-Path "pnpm-lock.yaml") {
            pnpm install --frozen-lockfile
        } elseif (Test-Path "package-lock.json") {
            npm ci
        } else {
            npm install
        }
        
        npm run build
        
        if (Test-Path "dist\index.js") {
            $size = (Get-Item "dist\index.js").Length / 1KB
            Write-Success "Lambda built successfully (${size}KB)"
        } else {
            Write-Error "Lambda build failed - dist/index.js not found"
            exit 1
        }
    } catch {
        Write-Error "Failed to build Lambda: $_"
        exit 1
    }
    Pop-Location
} else {
    Write-Warn "Skipping Lambda build (--SkipBuild)"
}

# Step 4: Synthesize CDK
Write-Info "Synthesizing CloudFormation template..."

Push-Location $InfraDir
try {
    npx cdk synth
    Write-Success "CDK synthesis complete"
} catch {
    Write-Error "CDK synthesis failed: $_"
    exit 1
}

# Step 5: Show diff
Write-Info "Checking for changes..."

try {
    npx cdk diff
} catch {
    # cdk diff returns non-zero if there are changes, which is fine
    Write-Info "Changes detected"
}

# Step 6: Deploy
if (-not $DryRun) {
    Write-Info "Deploying Lambda..."
    
    try {
        npx cdk deploy --require-approval never
        Write-Success "=========================================="
        Write-Success "DEPLOYMENT COMPLETE!"
        Write-Success "=========================================="
    } catch {
        Write-Error "Deployment failed: $_"
        exit 1
    }
    
    # Get outputs
    Write-Info "Getting stack outputs..."
    try {
        $outputs = aws cloudformation describe-stacks --stack-name MediaCompressionStack --query "Stacks[0].Outputs" --output json | ConvertFrom-Json
        
        Write-Info "Stack Outputs:"
        foreach ($output in $outputs) {
            Write-Host "  $($output.OutputKey): $($output.OutputValue)"
        }
    } catch {
        Write-Warn "Could not retrieve stack outputs"
    }
} else {
    Write-Warn "DRY RUN - Skipping deployment"
    Write-Info "Run without -DryRun to deploy changes"
}

Pop-Location

Write-Success "Done!"
