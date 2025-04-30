import { Header } from "./header.js";
import { Content } from "./content.js";
import { Footer } from "./footer.js";
import { SubmitGameForm } from "./submit-game-form.js";

export const App = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);

  const openForm = () => setIsFormOpen(true);
  const closeForm = () => setIsFormOpen(false);

  useEffect(() => {
    const submitButton = document.getElementById("submit-game-btn");
    submitButton?.addEventListener("click", openForm);
    
    // Add listener for custom event from the new CTA button
    window.addEventListener("open-submit-form", openForm);

    return () => {
      submitButton?.removeEventListener("click", openForm);
      window.removeEventListener("open-submit-form", openForm);
    };
  }, []);

  return html`
    <div class="bg-yellow-50 min-h-screen">
      <${Header} />
      <${Content} />
      <${Footer} />
      <${SubmitGameForm} isOpen=${isFormOpen} onClose=${closeForm} />
    </div>
  `;
};
