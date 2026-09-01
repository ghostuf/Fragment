import { useState } from "react";
import { Uploader } from "./Uploader";
import { FilesList } from "./FilesList";
import "./App.css";

function App() {
  const [refreshSignal, setRefreshSignal] = useState(0);

  return (
    <div className="app">
      <header>
        <h1>Fragment</h1>
        <p className="tagline">Chunked uploads straight to R2, reassembled on the fly.</p>
      </header>

      <Uploader onUploaded={() => setRefreshSignal((n) => n + 1)} />

      <section>
        <FilesList refreshSignal={refreshSignal} />
      </section>
    </div>
  );
}

export default App;
