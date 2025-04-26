import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * DocumentUpload Component
 * 
 * A reusable component for uploading Word documents and processing them
 * Handles file selection, upload and processing via the server API
 */

interface DocumentUploadProps {
  onContentLoaded: (content: string) => void;
  buttonText?: string;
}

export function DocumentUpload({ onContentLoaded, buttonText = "Upload Document" }: DocumentUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if it's a Word document
    if (!file.name.endsWith('.docx')) {
      toast({
        title: "Invalid file type",
        description: "Please select a Word document (.docx)",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    
    try {
      // Create FormData and append the file
      const formData = new FormData();
      formData.append('document', file);

      // Send the file to the server for processing
      const response = await fetch('/api/process', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        console.error('Document processing failed:', response.status, response.statusText);
        if (response.status === 401) {
          throw new Error('Authentication required. Please ensure you are logged in.');
        } else {
          throw new Error(`Failed to process document: ${response.statusText}`);
        }
      }

      const data = await response.json();
      
      // Call the provided callback with the processed content
      onContentLoaded(data.content);
      
      toast({
        title: "Document processed",
        description: "Your document has been successfully processed."
      });
    } catch (error) {
      console.error('Error processing document:', error);
      toast({
        title: "Processing failed",
        description: error instanceof Error ? error.message : "Failed to process the document",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full">
      <input
        type="file"
        id="document-upload"
        className="hidden"
        accept=".docx"
        onChange={handleFileChange}
        disabled={isUploading}
      />
      <Button 
        variant="outline" 
        onClick={() => document.getElementById('document-upload')?.click()}
        disabled={isUploading}
        className="w-full"
      >
        {isUploading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <FileText className="h-4 w-4 mr-2" />
            {buttonText}
          </>
        )}
      </Button>
    </div>
  );
}