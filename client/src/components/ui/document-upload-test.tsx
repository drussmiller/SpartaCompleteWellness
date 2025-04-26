/**
 * Document Upload Test Component
 * This component is used to test the document upload functionality
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentUpload } from './document-upload';

export function DocumentUploadTest() {
  const [processedContent, setProcessedContent] = useState<string>('');
  
  const handleContentLoaded = (content: string) => {
    setProcessedContent(content);
  };
  
  return (
    <div className="container mx-auto p-4">
      <Card className="w-full mb-4">
        <CardHeader>
          <CardTitle>Document Upload Test</CardTitle>
          <CardDescription>
            Upload a Word document (.docx) to test the document processing functionality
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentUpload 
            onContentLoaded={handleContentLoaded} 
            buttonText="Upload .docx File"
          />
        </CardContent>
      </Card>
      
      {processedContent && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Processed Content</CardTitle>
            <CardDescription>
              The document has been processed successfully
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border p-4 rounded-md bg-slate-50 max-h-[500px] overflow-auto">
              <div dangerouslySetInnerHTML={{ __html: processedContent }} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default DocumentUploadTest;