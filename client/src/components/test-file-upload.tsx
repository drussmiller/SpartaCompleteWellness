import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

type FileInfo = {
  url: string;
  thumbnailUrl: string;
  filename: string;
  mimeType: string;
  size: number;
  path: string;
  fromObjectStorage: boolean;
  retrievalTest?: string;
};

export function TestFileUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<FileInfo | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setUploadResult(null);
    setUploadError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError('Please select a file first');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/upload-test', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      setUploadResult(data);
      console.log('Upload successful:', data);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Input 
            type="file" 
            onChange={handleFileChange} 
            disabled={uploading}
          />
          <Button 
            onClick={handleUpload} 
            disabled={!selectedFile || uploading}
          >
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
        {selectedFile && (
          <p className="text-sm text-muted-foreground">
            Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
          </p>
        )}
        {uploadError && (
          <div className="text-sm text-destructive flex items-center">
            <XCircle className="h-4 w-4 mr-1" />
            {uploadError}
          </div>
        )}
      </div>

      {uploadResult && (
        <Card className="shadow-md border-2">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium text-lg">Upload Result</h3>
                <div className="flex items-center space-x-1">
                  <span className="text-sm font-medium">Retrieval Test:</span>
                  {uploadResult.retrievalTest === 'success' ? (
                    <div className="text-green-600 flex items-center">
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Success
                    </div>
                  ) : (
                    <div className="text-destructive flex items-center">
                      <XCircle className="h-4 w-4 mr-1" />
                      Failed
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">File Details</h4>
                  <ul className="text-sm space-y-1">
                    <li><span className="font-medium">Filename:</span> {uploadResult.filename}</li>
                    <li><span className="font-medium">Type:</span> {uploadResult.mimeType}</li>
                    <li><span className="font-medium">Size:</span> {Math.round(uploadResult.size / 1024)} KB</li>
                    <li><span className="font-medium">Stored In:</span> {uploadResult.fromObjectStorage ? 'Object Storage + Filesystem' : 'Filesystem Only'}</li>
                  </ul>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2">Storage Paths</h4>
                  <ul className="text-sm space-y-1 break-all">
                    <li><span className="font-medium">URL:</span> {uploadResult.url}</li>
                    <li><span className="font-medium">Thumbnail:</span> {uploadResult.thumbnailUrl || 'None'}</li>
                    <li><span className="font-medium">Path:</span> {uploadResult.path}</li>
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Preview</h4>
                  {uploadResult.mimeType.startsWith('image/') ? (
                    <img 
                      src={uploadResult.url} 
                      alt="Uploaded file" 
                      className="max-h-48 max-w-full object-contain border rounded"
                      onError={(e) => {
                        console.log('Failed to load image:', uploadResult.url);
                        // Try thumbnail as fallback
                        if (e.currentTarget.src !== uploadResult.thumbnailUrl && uploadResult.thumbnailUrl) {
                          console.log('Trying thumbnail fallback:', uploadResult.thumbnailUrl);
                          e.currentTarget.src = uploadResult.thumbnailUrl;
                        }
                      }}
                    />
                  ) : uploadResult.mimeType.startsWith('video/') ? (
                    <video 
                      controls 
                      className="max-h-48 max-w-full border rounded"
                      onError={(e) => console.log('Failed to load video:', uploadResult.url)}
                    >
                      <source src={uploadResult.url} type={uploadResult.mimeType} />
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <div className="p-4 bg-muted rounded text-center">
                      No preview available for this file type
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2">Thumbnail</h4>
                  {uploadResult.thumbnailUrl ? (
                    <img 
                      src={uploadResult.thumbnailUrl} 
                      alt="Thumbnail" 
                      className="max-h-48 max-w-full object-contain border rounded"
                      onError={() => console.log('Failed to load thumbnail:', uploadResult.thumbnailUrl)}
                    />
                  ) : (
                    <div className="p-4 bg-muted rounded text-center">
                      No thumbnail available
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}