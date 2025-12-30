"use client";

import { DeleteMessageDialog } from "@/components/delete-message-dialog";
import { ContactPreviewModal } from "@/components/dialogs/contact-preview-modal";
import { QuickContactFormModal } from "@/components/dialogs/quick-contact-form-modal";
import { SelectSenderModal } from "@/components/dialogs/select-sender-modal";
import { SendContactsModal } from "@/components/dialogs/send-contacts-modal";
import { ViewContactsModal } from "@/components/dialogs/view-contacts-modal";
import {
  CameraCapturePanel,
  ImageEditorPanel,
} from "@/components/image-editor";
import { MediaDownloadMenu } from "@/components/media/media-download-menu";
import { MediaPreviewModal } from "@/components/media/media-preview-modal";
import {
  MediaStagingPanel,
  StagedFile,
} from "@/components/media/media-staging-panel";
import { VideoPreviewPlayer } from "@/components/ui/video-preview-player";
import { Attachment } from "@/lib/media/types";
import {
  ContactToSend,
  ReceivedContact,
} from "@/lib/types/contact-message.types";
import type { Sender } from "../types";

interface ChatsModalsProps {
  // Media staging
  mediaStagingOpen: boolean;
  stagedFiles: StagedFile[];
  isUploading: boolean;
  sendButtonText: string;
  onCloseStagingModal: () => void;
  onSendMediaFromStaging: (caption: string) => void;
  onAddMoreMedia: () => void;
  onRemoveStagedFile: (id: string) => void;
  onEditStagedImage: (file: StagedFile) => void;

  // Media preview
  previewModalOpen: boolean;
  previewAttachments: Attachment[];
  previewMessageId: string;
  previewInitialIndex: number;
  onClosePreviewModal: () => void;

  // Download menu
  downloadMenuOpen: boolean;
  downloadMenuPosition: { x: number; y: number };
  currentMessageAttachments: Attachment[];
  downloadLoading: boolean;
  onDownloadSingle: () => void;
  onDownloadPack: () => void;
  onCloseDownloadMenu: () => void;

  // Delete dialog
  deleteDialogOpen: boolean;
  deletingMessageId: string;
  onCloseDeleteDialog: () => void;
  onConfirmDelete: (messageId: string) => Promise<void>;

  // Video preview
  videoPreview: { videoId: string; url: string; title?: string } | null;
  onCloseVideoPreview: () => void;

  // Camera capture
  cameraOpen: boolean;
  onCameraCapture: (imageDataUrl: string) => void;
  onCameraClose: () => void;

  // Image editor
  imageEditorOpen: boolean;
  imageToEdit: string | null;
  imageEditorSource: "camera" | "attachment" | "staged" | null;
  onImageEditorSend: (imageBlob: Blob, caption: string) => Promise<void>;
  onImageEditorRetake: () => void;
  onImageEditorClose: () => void;
  onStagedImageEdited?: (imageBlob: Blob) => void;

  // Contact modals
  sendContactsModalOpen: boolean;
  contactPreviewModalOpen: boolean;
  viewContactsModalOpen: boolean;
  quickContactFormOpen: boolean;
  senderSelectModalOpen: boolean;
  contactsToSend: ContactToSend[];
  contactsToView: ReceivedContact[];
  contactToSave: ReceivedContact | null;
  contactToStartChat: {
    firstName: string;
    lastName?: string;
    phoneNumber: string;
  } | null;
  allContacts: ContactToSend[];
  senders: Sender[];
  isSendingContacts: boolean;
  isSavingContact: boolean;
  contactsLoading: boolean;
  onCloseSendContactsModal: () => void;
  onContactsSelected: (contacts: ContactToSend[]) => void;
  onCloseContactPreviewModal: () => void;
  onBackToContactSelection: () => void;
  onConfirmSendContacts: () => void;
  onStartChatWithContact: (contact: ContactToSend | ReceivedContact) => void;
  onCloseViewContactsModal: () => void;
  onSaveContactFromMessage: (contact: ReceivedContact) => void;
  onCloseQuickContactForm: () => void;
  onQuickSaveContact: (data: {
    firstName: string;
    lastName: string;
    countryCode: string;
    phoneNumber: string;
  }) => void;
  onCloseSenderSelectModal: () => void;
  onSenderSelectedForContact: (
    senderId: number,
    senderPhoneNumber: string
  ) => void;
}

export function ChatsModals({
  mediaStagingOpen,
  stagedFiles,
  isUploading,
  sendButtonText,
  onCloseStagingModal,
  onSendMediaFromStaging,
  onAddMoreMedia,
  onRemoveStagedFile,
  onEditStagedImage,
  previewModalOpen,
  previewAttachments,
  previewMessageId,
  previewInitialIndex,
  onClosePreviewModal,
  downloadMenuOpen,
  downloadMenuPosition,
  currentMessageAttachments,
  downloadLoading,
  onDownloadSingle,
  onDownloadPack,
  onCloseDownloadMenu,
  deleteDialogOpen,
  deletingMessageId,
  onCloseDeleteDialog,
  onConfirmDelete,
  videoPreview,
  onCloseVideoPreview,
  cameraOpen,
  onCameraCapture,
  onCameraClose,
  imageEditorOpen,
  imageToEdit,
  imageEditorSource,
  onImageEditorSend,
  onImageEditorRetake,
  onImageEditorClose,
  onStagedImageEdited,
  sendContactsModalOpen,
  contactPreviewModalOpen,
  viewContactsModalOpen,
  quickContactFormOpen,
  senderSelectModalOpen,
  contactsToSend,
  contactsToView,
  contactToSave,
  contactToStartChat,
  allContacts,
  senders,
  isSendingContacts,
  isSavingContact,
  contactsLoading,
  onCloseSendContactsModal,
  onContactsSelected,
  onCloseContactPreviewModal,
  onBackToContactSelection,
  onConfirmSendContacts,
  onStartChatWithContact,
  onCloseViewContactsModal,
  onSaveContactFromMessage,
  onCloseQuickContactForm,
  onQuickSaveContact,
  onCloseSenderSelectModal,
  onSenderSelectedForContact,
}: ChatsModalsProps) {
  // Handler for image editor completion - different behavior based on source
  const handleImageEditorComplete = async (
    imageBlob: Blob,
    caption: string
  ) => {
    if (imageEditorSource === "staged" && onStagedImageEdited) {
      // For staged images, just replace the file and don't send
      onStagedImageEdited(imageBlob);
    } else {
      // For camera/attachment, send the message
      await onImageEditorSend(imageBlob, caption);
    }
  };

  return (
    <>
      {/* Media Staging Panel */}
      <MediaStagingPanel
        isOpen={mediaStagingOpen}
        files={stagedFiles}
        onClose={onCloseStagingModal}
        onSend={onSendMediaFromStaging}
        onAddMore={onAddMoreMedia}
        onRemove={onRemoveStagedFile}
        onEditImage={onEditStagedImage}
        disabled={isUploading}
        sendButtonText={sendButtonText}
      />

      {/* Media Preview Modal */}
      <MediaPreviewModal
        isOpen={previewModalOpen}
        attachments={previewAttachments}
        messageId={previewMessageId}
        initialIndex={previewInitialIndex}
        onClose={onClosePreviewModal}
      />

      {/* Download Menu */}
      <MediaDownloadMenu
        isOpen={downloadMenuOpen}
        position={downloadMenuPosition}
        isSingleImage={currentMessageAttachments.length === 1}
        isLoading={downloadLoading}
        onDownloadSingle={onDownloadSingle}
        onDownloadPack={onDownloadPack}
        onClose={onCloseDownloadMenu}
      />

      {/* Delete Message Dialog */}
      <DeleteMessageDialog
        open={deleteDialogOpen}
        messageId={deletingMessageId}
        onClose={onCloseDeleteDialog}
        onConfirm={onConfirmDelete}
      />

      {/* Video Preview Player */}
      {videoPreview && (
        <VideoPreviewPlayer
          videoId={videoPreview.videoId}
          url={videoPreview.url}
          title={videoPreview.title}
          onClose={onCloseVideoPreview}
        />
      )}

      {/* Camera Capture Panel */}
      {cameraOpen && (
        <CameraCapturePanel
          onCapture={onCameraCapture}
          onCancel={onCameraClose}
        />
      )}

      {/* Image Editor Panel */}
      {imageEditorOpen && imageToEdit && (
        <ImageEditorPanel
          image={imageToEdit}
          isFromCamera={imageEditorSource === "camera"}
          isFromStaged={imageEditorSource === "staged"}
          onComplete={handleImageEditorComplete}
          onCancel={onImageEditorClose}
          onRetake={
            imageEditorSource === "camera" ? onImageEditorRetake : undefined
          }
        />
      )}

      {/* Send Contacts Modal */}
      <SendContactsModal
        isOpen={sendContactsModalOpen}
        onClose={onCloseSendContactsModal}
        onSend={onContactsSelected}
        contacts={allContacts}
        initialSelectedContacts={contactsToSend}
        isLoading={contactsLoading}
      />

      {/* Contact Preview Modal */}
      <ContactPreviewModal
        isOpen={contactPreviewModalOpen}
        onClose={onCloseContactPreviewModal}
        onBack={onBackToContactSelection}
        onConfirmSend={onConfirmSendContacts}
        contacts={contactsToSend}
        onStartChat={onStartChatWithContact}
        isLoading={isSendingContacts}
      />

      {/* View Contacts Modal */}
      <ViewContactsModal
        isOpen={viewContactsModalOpen}
        onClose={onCloseViewContactsModal}
        contacts={contactsToView}
        onStartChat={onStartChatWithContact}
        onSaveContact={onSaveContactFromMessage}
      />

      {/* Quick Contact Form Modal */}
      <QuickContactFormModal
        isOpen={quickContactFormOpen}
        onClose={onCloseQuickContactForm}
        onSave={onQuickSaveContact}
        initialData={
          contactToSave
            ? {
                firstName:
                  contactToSave.name.first_name ||
                  contactToSave.name.formatted_name ||
                  "",
                lastName: contactToSave.name.last_name || "",
                phoneNumber:
                  contactToSave.phones?.[0]?.phone ||
                  contactToSave.phones?.[0]?.wa_id ||
                  "",
              }
            : undefined
        }
        isLoading={isSavingContact}
      />

      {/* Sender Select Modal */}
      <SelectSenderModal
        isOpen={senderSelectModalOpen}
        onClose={onCloseSenderSelectModal}
        onSelect={onSenderSelectedForContact}
        contact={
          contactToStartChat
            ? {
                firstName: contactToStartChat.firstName,
                lastName: contactToStartChat.lastName,
                phoneNumber: contactToStartChat.phoneNumber,
              }
            : undefined
        }
        senders={senders}
      />
    </>
  );
}
