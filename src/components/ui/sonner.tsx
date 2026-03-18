import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-white group-[.toaster]:text-neutral-950 group-[.toaster]:border-neutral-200/60 group-[.toaster]:shadow-xl group-[.toaster]:rounded-xl',
          description: 'group-[.toast]:text-neutral-500',
          actionButton:
            'group-[.toast]:bg-accent-600 group-[.toast]:text-white',
          cancelButton:
            'group-[.toast]:bg-neutral-100 group-[.toast]:text-neutral-500',
          error:
            'group-[.toaster]:bg-red-50 group-[.toaster]:text-red-900 group-[.toaster]:border-red-200',
          success:
            'group-[.toaster]:bg-green-50 group-[.toaster]:text-green-900 group-[.toaster]:border-green-200',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
