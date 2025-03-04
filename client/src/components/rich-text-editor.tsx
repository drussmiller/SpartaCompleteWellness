import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Button } from './ui/button'
import { Bold, Italic, Link as LinkIcon, List, ListOrdered } from 'lucide-react'

interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
}

export function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline'
        }
      })
    ],
    content,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none p-4',
      }
    },
    onUpdate: ({ editor }) => {
      const rawContent = editor.getHTML();
      onChange(rawContent);
    }
  })

  if (!editor) {
    return null
  }

  return (
    <div className="border rounded-md flex flex-col">
      <div className="flex items-center gap-1 p-2 border-b bg-background sticky top-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'bg-muted' : ''}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'bg-muted' : ''}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'bg-muted' : ''}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'bg-muted' : ''}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const url = window.prompt('Enter link URL')
            if (url) {
              editor.chain().focus().setLink({ href: url }).run()
            }
          }}
          className={editor.isActive('link') ? 'bg-muted' : ''}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
      </div>
      <div className="overflow-y-auto max-h-[300px]">
        <EditorContent editor={editor} />
      </div>
      <style>{`
        .video-wrapper {
          position: relative;
          padding-bottom: 56.25%; /* 16:9 aspect ratio */
          height: 0;
          margin: 1rem 0;
        }
        .video-wrapper iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
      `}</style>
    </div>
  )
}