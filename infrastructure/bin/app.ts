#!/usr/bin/env node
/**
 * CDK App Entry Point
 *
 * Defines the CDK application and instantiates stacks.
 *
 * Usage:
 * - Configure stack props below or via environment variables
 * - Run `cdk synth` to generate CloudFormation templates
 * - Run `cdk deploy` to deploy (requires AWS credentials)
 *
 * Environment variables:
 * - CDK_DEFAULT_ACCOUNT: AWS account ID
 * - CDK_DEFAULT_REGION: AWS region
 * - INPUT_BUCKET_ARN: ARN of existing S3 bucket for input media
 * - OUTPUT_BUCKET_ARN: ARN of existing S3 bucket for output media (optional)
 * - FFMPEG_LAYER_ARN: ARN of ffmpeg Lambda Layer
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import * as cdk from "aws-cdk-lib";
import "source-map-support/register";
import { MediaCompressionStack } from "../lib/media-compression-stack";

// Initialize CDK app
const app = new cdk.App();

// ============================================================================
// Configuration
// ============================================================================
// These values should be configured for your environment.
// For production, use environment variables or CDK context.

// AWS account and region
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
  region:
    process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || "us-east-1",
};

// S3 bucket configuration
// INPUT_BUCKET_ARN is REQUIRED - the bucket must already exist
const inputBucketArn =
  process.env.INPUT_BUCKET_ARN || app.node.tryGetContext("inputBucketArn");

// OUTPUT_BUCKET_ARN is optional - if not provided, a new bucket will be created
const outputBucketArn =
  process.env.OUTPUT_BUCKET_ARN || app.node.tryGetContext("outputBucketArn");

// ffmpeg Lambda Layer ARN
// If not provided, the stack will create a layer from local binaries
// Public layers by region: https://github.com/serverlesspub/ffmpeg-aws-lambda-layer
const ffmpegLayerArn =
  process.env.FFMPEG_LAYER_ARN || app.node.tryGetContext("ffmpegLayerArn");

// Validate required configuration
if (!inputBucketArn) {
  console.warn(
    "⚠️  Warning: INPUT_BUCKET_ARN not set. Set it via environment variable or CDK context.\n" +
      "   Example: cdk deploy -c inputBucketArn=arn:aws:s3:::my-media-bucket"
  );
}

if (!ffmpegLayerArn) {
  console.log(
    "ℹ️  Info: FFMPEG_LAYER_ARN not set. Will create a local layer from layers/ffmpeg."
  );
}

// ============================================================================
// Stack Instantiation
// ============================================================================

new MediaCompressionStack(app, "MediaCompressionStack", {
  env,
  description: "WhatsApp CRM - Media Compression Infrastructure (Lambda + SQS)",

  // S3 buckets - use same bucket for input and output
  inputBucketArn: inputBucketArn,
  useSameBucket: true, // Use same bucket for both input and output
  deleteOriginalAfterCompression: true, // Delete original after compression

  // ffmpeg layer - undefined means create from local binaries
  ffmpegLayerArn: ffmpegLayerArn || undefined,

  // Lambda configuration
  lambda: {
    memoryMb: 2048, // 2GB RAM for ffmpeg
    timeoutSeconds: 900, // 15 minutes (max)
    ephemeralStorageMb: 10240, // 10GB temp storage
    reservedConcurrency: 5, // Max 5 concurrent compressions
  },

  // Queue configuration
  queue: {
    maxReceiveCount: 3, // 2 retries + initial attempt
    dlqRetentionDays: 14, // Keep failed messages for 2 weeks
  },

  // Logging
  logRetentionDays: 14, // 2 weeks of logs

  // Resource naming
  resourcePrefix: "media-compression",
});

// Add tags to all resources
cdk.Tags.of(app).add("Project", "WhatsApp-CRM");
cdk.Tags.of(app).add("Component", "MediaCompression");
cdk.Tags.of(app).add("ManagedBy", "CDK");
