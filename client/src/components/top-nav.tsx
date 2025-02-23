import { CreatePostDialog } from "./create-post-dialog";

export function TopNav() {
  return (
    <nav className="sticky top-0 z-50 bg-background border-b border-border">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <img
            src="/attached_assets/Sparta Logo.jpg"
            alt="Sparta Complete Wellness"
            className="h-8"
          />
        </div>
        <CreatePostDialog />
      </div>
    </nav>
  );
}