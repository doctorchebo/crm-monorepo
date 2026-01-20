import { db } from "@/lib/db/drizzle";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

// SQS configuration - uses environment variable when deployed
const PASSWORD_RESET_QUEUE_URL = process.env.PASSWORD_RESET_EMAIL_QUEUE_URL;

// Initialize SQS client only if queue URL is configured
const sqsClient = PASSWORD_RESET_QUEUE_URL
  ? new SQSClient({
      region: process.env.AWS_REGION || "us-east-1",
    })
  : null;

interface PasswordResetEmailMessage {
  userId: number;
  email: string;
  name?: string;
  token: string;
  expiresAt: string;
}

async function sendPasswordResetEmail(message: PasswordResetEmailMessage) {
  if (sqsClient && PASSWORD_RESET_QUEUE_URL) {
    // Production: Send via SQS
    const command = new SendMessageCommand({
      QueueUrl: PASSWORD_RESET_QUEUE_URL,
      MessageBody: JSON.stringify(message),
    });

    await sqsClient.send(command);
    console.log(`[Password Reset] Email queued for ${message.email}`);
  } else {
    // Development: Log the reset link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password?token=${message.token}`;
    console.log(
      `[Password Reset] Development mode - Reset link for ${message.email}: ${resetUrl}`,
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Find user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
      columns: { id: true, email: true, name: true },
    });

    // Always return success to prevent email enumeration attacks
    // But only actually create a token if the user exists
    if (user) {
      // Generate a secure random token
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      // Token expires in 1 hour
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      // Delete any existing tokens for this user
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, user.id));

      // Create new reset token
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      // Send password reset email (via SQS in production, console in dev)
      await sendPasswordResetEmail({
        userId: user.id,
        email: user.email,
        name: user.name || undefined,
        token,
        expiresAt: expiresAt.toISOString(),
      });
    }

    // Always return success (security: don't reveal if email exists)
    return NextResponse.json({
      success: true,
      message:
        "If an account exists with this email, a reset link has been sent.",
    });
  } catch (error) {
    console.error("[API] Forgot password error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 },
    );
  }
}
