import { useState, useRef } from 'react';
import { Button } from './button';
import { Loader2, Upload, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Input } from './input';

interface DocumentUploadProps {
  onContentLoaded: (content: string) => void;
  buttonText?: string;
}

export function DocumentUpload({ onContentLoaded, buttonText = "Upload Document" }: DocumentUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.docx')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a Word document (.docx)',
        variant: 'destructive',
      });
      return;
    }

    setFileName(file.name);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('document', file);

      const response = await fetch('/api/activities/upload-doc', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Document uploaded successfully',
          description: 'The document has been processed and content extracted.',
        });
        onContentLoaded(data.content);
      } else {
        toast({
          title: 'Upload failed',
          description: data.message || 'An error occurred while processing the document.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Document upload error:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col gap-2">
      <Input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".docx"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full flex gap-2 items-center justify-center"
        onClick={handleButtonClick}
        disabled={isUploading}
      >
        {isUploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Processing...</span>
          </>
        ) : fileName ? (
          <>
            <FileText className="h-4 w-4" />
            <span>{fileName}</span>
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            <span>{buttonText}</span>
          </>
        )}
      </Button>
    </div>
  );
}