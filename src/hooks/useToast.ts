import toast from 'react-hot-toast';

export function useToast() {
  const showSuccess = (title: string, message?: string) => {
    toast.success(message ? `${title}: ${message}` : title, { duration: 4000 });
  };
  const showError = (title: string, message?: string) => {
    toast.error(message ? `${title}: ${message}` : title, { duration: 6000 });
  };
  const showWarning = (title: string, message?: string) => {
    toast(message ? `${title}: ${message}` : title, {
      icon: '⚠️',
      duration: 5000,
      style: { background: '#fef3c7', color: '#92400e' }
    });
  };
  const showInfo = (title: string, message?: string) => {
    toast(message ? `${title}: ${message}` : title, {
      icon: 'ℹ️',
      duration: 4000
    });
  };
  return { showSuccess, showError, showWarning, showInfo };
}
