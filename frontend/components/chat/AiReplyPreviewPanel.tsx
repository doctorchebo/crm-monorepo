import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, Send, X, Edit2, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AiReplyPreviewProps {
    content: string;
    mediaAttachment?: any; // To be typed properly with DTOs
    interactiveData?: any;
    onSend: (content: string, media?: any, interactive?: any) => Promise<void>;
    onDiscard: () => Promise<void>;
    isSending: boolean;
}

export function AiReplyPreviewPanel({
    content,
    mediaAttachment,
    interactiveData,
    onSend,
    onDiscard,
    isSending
}: AiReplyPreviewProps) {
    const t = useTranslations('chat'); // Assuming 'chat' namespace exists
    const [editedContent, setEditedContent] = useState(content);
    const [isEditing, setIsEditing] = useState(false);

    // Sync state if prop updates (e.g. new generation)
    useEffect(() => {
        setEditedContent(content);
    }, [content]);

    const handleSend = async () => {
        await onSend(editedContent, mediaAttachment, interactiveData);
    };

    return (
        <Card className="mb-4 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 shadow-sm max-h-[60vh] flex flex-col">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                    <Bot className="h-4 w-4" />
                    <CardTitle className="text-sm font-medium">
                        {t('aiReplyPreview') || 'AI Reply Preview'}
                    </CardTitle>
                </div>
                <div className="flex gap-1">
                    {/* Action buttons could go here if header-based actions needed */}
                </div>
            </CardHeader>

            <CardContent className="pb-2 flex-1 overflow-y-auto min-h-0">
                {isEditing ? (
                    <Textarea
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        className="min-h-[100px] resize-y bg-background"
                        disabled={isSending}
                    />
                ) : (
                    <div className="p-3 rounded-md bg-background/50 border text-sm whitespace-pre-wrap">
                        {editedContent}
                        {mediaAttachment && (
                            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                                <span>📎 {t('attachment') || 'Attachment'}:</span>
                                <span className="font-medium">{mediaAttachment.fileName || 'Media'}</span>
                            </div>
                        )}
                        {interactiveData && (
                            <div className="mt-2 text-xs text-muted-foreground">
                                <span className="bg-blue-100 dark:bg-blue-900 px-1 rounded">
                                    {t('interactiveButtons') || 'Interactive Buttons'}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>

            <CardFooter className="justify-end gap-2 pt-0">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onDiscard}
                    disabled={isSending}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-900/50"
                >
                    <X className="h-4 w-4 mr-1" />
                    {t('discard') || 'Discard'}
                </Button>

                {isEditing ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditing(false)}
                        disabled={isSending}
                    >
                        <Check className="h-4 w-4 mr-1" />
                        {t('done') || 'Done'}
                    </Button>
                ) : (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                        disabled={isSending}
                    >
                        <Edit2 className="h-4 w-4 mr-1" />
                        {t('edit') || 'Edit'}
                    </Button>
                )}

                <Button
                    size="sm"
                    onClick={handleSend}
                    disabled={isSending}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                    <Send className="h-4 w-4 mr-1" />
                    {t('send') || 'Send'}
                </Button>
            </CardFooter>
        </Card>
    );
}
