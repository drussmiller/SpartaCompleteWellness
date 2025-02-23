import Image from 'next/image';

function MyComponent() {
  return (
    <div>
      <Image src="/attached_assets/Sparta_Logo.jpg" alt="Sparta Logo" className="h-full w-full" />
    </div>
  );
}

export default MyComponent;