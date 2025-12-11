/**
 * Media API Client
 * Handles all media upload/download operations
 */

import { getCookie } from "@/lib/cookies";
import { DownloadUrlResponse, PresignedUrlResponse } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Get JWT token from cookies
 */
function getAuthToken(): string | null {
  return getCookie("jwt_token");
}

export const mediaApi = {
  /**
   * Upload file directly through backend (avoids CORS issues)
   */
  async uploadFileToBackend(
    file: File,
    senderId: number,
    contactId: string,
    messageId?: string,
    onProgress?: (progress: number) => void
  ): Promise<{
    success: boolean;
    uploadId: string;
    s3Key: string;
    attachment: any;
  }> {
    const token = getAuthToken();
    const formData = new FormData();
    formData.append("file", file);

    console.log(`[BackendUpload] Starting upload through backend`, {
      fileName: file.name,
      size: file.size,
      senderId,
      contactId,
      messageId,
    });

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = (event.loaded / event.total) * 100;
          console.log(`[BackendUpload] Progress: ${progress.toFixed(1)}%`);
          onProgress(progress);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            console.log(`[BackendUpload] Upload successful:`, result);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse upload response: ${error}`));
          }
        } else {
          const errorMsg = `Upload failed with status ${xhr.status}`;
          console.error(`[BackendUpload] ${errorMsg}`);
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.message || errorMsg));
          } catch {
            reject(new Error(errorMsg));
          }
        }
      });

      xhr.addEventListener("error", () => {
        console.error(`[BackendUpload] Network error`);
        reject(new Error("Upload failed due to network error"));
      });

      xhr.addEventListener("abort", () => {
        console.error(`[BackendUpload] Upload cancelled`);
        reject(new Error("Upload was cancelled"));
      });

      const params = new URLSearchParams();
      params.append("senderId", senderId.toString());
      params.append("contactId", contactId);
      if (messageId) params.append("messageId", messageId);

      xhr.open(
        "POST",
        `${API_BASE_URL}/whatsapp/media/upload?${params.toString()}`
      );
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      xhr.send(formData);
    });
  },

  /**
   * Request presigned URL for upload
   */
  async requestPresignedUrl(
    fileName: string,
    mimeType: string,
    fileSize: number,
    senderId?: number,
    contactId?: string
  ): Promise<PresignedUrlResponse> {
    const params = new URLSearchParams();
    if (senderId) params.append("senderId", senderId.toString());
    if (contactId) params.append("contactId", contactId);

    const token = getAuthToken();
    const response = await fetch(
      `${API_BASE_URL}/whatsapp/media/presigned-url?${params.toString()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          fileName,
          mimeType,
          fileSize,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to request presigned URL");
    }

    return response.json();
  },

  /**
   * Upload file to S3 using presigned URL
   */
  async uploadToS3(
    presignedUrl: string,
    file: File,
    mimeType: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[S3Upload] Starting upload to presigned URL`);
      const xhr = new XMLHttpRequest();
      let timeoutId: NodeJS.Timeout;

      // Track upload progress
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = (event.loaded / event.total) * 100;
          console.log(`[S3Upload] Progress: ${progress.toFixed(1)}%`);
          onProgress(progress);
        }
      });

      xhr.addEventListener("load", () => {
        clearTimeout(timeoutId);
        console.log(`[S3Upload] Load event - status: ${xhr.status}`);
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log(`[S3Upload] Upload successful`);
          resolve();
        } else {
          const errorMsg = `Upload failed with status ${xhr.status}: ${xhr.statusText}`;
          console.error(`[S3Upload] ${errorMsg}`);
          console.log(`[S3Upload] Response:`, xhr.responseText);
          reject(new Error(errorMsg));
        }
      });

      xhr.addEventListener("error", () => {
        clearTimeout(timeoutId);
        const errorMsg = "Upload failed due to network error";
        console.error(`[S3Upload] ${errorMsg}`);
        reject(new Error(errorMsg));
      });

      xhr.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        const errorMsg = "Upload was cancelled";
        console.error(`[S3Upload] ${errorMsg}`);
        reject(new Error(errorMsg));
      });

      xhr.open("PUT", presignedUrl);
      xhr.setRequestHeader("Content-Type", mimeType);

      // Add timeout for upload (30 seconds)
      timeoutId = setTimeout(() => {
        console.error(`[S3Upload] Upload timeout after 30 seconds`);
        xhr.abort();
        reject(new Error("Upload timeout"));
      }, 30000);

      console.log(`[S3Upload] Sending ${file.size} bytes to S3`);
      xhr.send(file);
    });
  },

  /**
   * Notify backend of completed upload
   */
  async notifyUploadCompleted(
    uploadId: string,
    fileName: string,
    mimeType: string,
    fileSize: number,
    s3Key: string,
    messageId: string,
    duration?: number
  ): Promise<{ success: boolean; attachment: any }> {
    const token = getAuthToken();
    console.log(`[NotifyUpload] Notifying backend of upload completion`, {
      uploadId,
      fileName,
      s3Key,
      messageId,
      fileSize,
    });

    const response = await fetch(
      `${API_BASE_URL}/whatsapp/media/upload-completed?messageId=${messageId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          uploadId,
          fileName,
          mimeType,
          fileSize,
          s3Key,
          duration,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      const errorMsg = error.message || "Failed to notify upload completion";
      console.error(`[NotifyUpload] Error:`, {
        status: response.status,
        message: errorMsg,
      });
      throw new Error(errorMsg);
    }

    const result = await response.json();
    console.log(`[NotifyUpload] Success:`, result);
    return result;
  },

  /**
   * Get download URL for attachment
   */
  async getDownloadUrl(
    messageId: string,
    attachmentId: string,
    expiresIn?: number
  ): Promise<DownloadUrlResponse> {
    const params = new URLSearchParams();
    if (expiresIn) params.append("expiresIn", expiresIn.toString());

    const token = getAuthToken();
    const response = await fetch(
      `${API_BASE_URL}/whatsapp/media/${messageId}/${attachmentId}/download-url?${params.toString()}`,
      {
        method: "GET",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to get download URL");
    }

    return response.json();
  },

  /**
   * Get thumbnail URL for attachment
   */
  async getThumbnailUrl(
    messageId: string,
    attachmentId: string,
    expiresIn?: number
  ): Promise<string | null> {
    const params = new URLSearchParams();
    if (expiresIn) params.append("expiresIn", expiresIn.toString());

    const token = getAuthToken();
    const response = await fetch(
      `${API_BASE_URL}/whatsapp/media/${messageId}/${attachmentId}/thumbnail-url?${params.toString()}`,
      {
        method: "GET",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.url;
  },

  /**
   * Get all attachments for message
   */
  async getMessageAttachments(messageId: string): Promise<any[]> {
    const token = getAuthToken();
    const response = await fetch(
      `${API_BASE_URL}/whatsapp/media/${messageId}/attachments`,
      {
        method: "GET",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to fetch attachments");
    }

    const data = await response.json();
    return data.attachments;
  },

  /**
   * Delete attachment from message
   */
  async deleteAttachment(
    messageId: string,
    attachmentId: string
  ): Promise<void> {
    const token = getAuthToken();
    const response = await fetch(
      `${API_BASE_URL}/whatsapp/media/${messageId}/${attachmentId}`,
      {
        method: "DELETE",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to delete attachment");
    }
  },

  /**
   * Delete all attachments from message
   */
  async deleteAllAttachments(messageId: string): Promise<void> {
    const token = getAuthToken();
    const response = await fetch(
      `${API_BASE_URL}/whatsapp/media/${messageId}`,
      {
        method: "DELETE",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to delete attachments");
    }
  },

  /**
   * Fetch media from Meta Cloud API via backend
   * The backend handles authentication with Meta and returns the media buffer
   *
   * @param mediaId - The media ID from a cloud-api:// URL
   * @returns Response object with the media blob
   */
  async fetchCloudAPIMedia(mediaId: string): Promise<Response> {
    const token = getAuthToken();
    const response = await fetch(
      `${API_BASE_URL}/whatsapp/media/cloud-api/${mediaId}`,
      {
        method: "GET",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch cloud media: ${error}`);
    }

    return response;
  },
};
