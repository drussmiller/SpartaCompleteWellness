/**
 * Document Upload Test Component
 * This component is used to test the document upload functionality
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentUpload } from './document-upload';
import { Button } from './button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

export function DocumentUploadTest() {
  const [processedContent, setProcessedContent] = useState<string>('');
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  
  const handleContentLoaded = (content: string) => {
    setProcessedContent(content);
  };
  
  // Function to show a demo of processed document content
  const loadDemoContent = () => {
    setIsLoadingDemo(true);
    
    // Simulate processing delay
    setTimeout(() => {
      const demoContent = `
        <h1>Sample Processed Document</h1>
        <p>This is an example of how document content would look after processing.</p>
        <h2>Features of Document Processing</h2>
        <ul>
          <li>Conversion of Word documents to HTML</li>
          <li>Preservation of headings and formatting</li>
          <li>Support for lists and paragraphs</li>
          <li>Clean, readable output</li>
        </ul>
        <p>When a real document is uploaded, the mammoth library converts it to HTML that can be safely displayed in the application.</p>
      `;
      
      setProcessedContent(demoContent);
      setIsLoadingDemo(false);
      
      toast({
        title: "Demo content loaded",
        description: "This is sample content to demonstrate how document processing works."
      });
    }, 1000);
  };
  
  return (
    <div className="container mx-auto p-4">
      <Card className="w-full mb-4">
        <CardHeader>
          <CardTitle>Document Upload Test</CardTitle>
          <CardDescription>
            Upload a Word document (.docx) to test the document processing functionality
            {!user && <p className="text-red-500 mt-2">Note: You need to be logged in to upload documents.</p>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DocumentUpload 
            onContentLoaded={handleContentLoaded} 
            buttonText="Upload .docx File"
          />
          
          <div className="my-2 text-center">- OR -</div>
          
          <Button
            variant="secondary"
            className="w-full"
            onClick={loadDemoContent}
            disabled={isLoadingDemo}
          >
            Load Demo Content
          </Button>
        </CardContent>
      </Card>
      
      {processedContent && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Processed Content</CardTitle>
            <CardDescription>
              {user ? "The document has been processed successfully" : "Demo content showing how processing works"}
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