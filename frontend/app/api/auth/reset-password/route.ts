import { db } from "@/lib/db/drizzle";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/session";
import { eq, and, gt, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, password, confirmPassword } = body;

    if (!token || !password || !confirmPassword) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 },
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "Passwords don't match" },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    // Hash the token to look it up
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Find the reset token
    const resetToken = await db.query.passwordResetTokens.findFirst({
      where: and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        gt(passwordResetTokens.expiresAt, new Date()),
        isNull(passwordResetTokens.usedAt),
      ),
    });

    if (!resetToken) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired" },
        { status: 400 },
      );
    }

    // Hash the new password
    const passwordHash = await hashPassword(password);

    // Update the user's password
    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, resetToken.userId));

    // Mark the token as used
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, resetToken.id));

    console.log(
      `[Password Reset] Password reset successfully for user ID: ${resetToken.userId}`,
    );

    return NextResponse.json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (error) {
    console.error("[API] Reset password error:", error);
    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 500 },
    );
  }
}
