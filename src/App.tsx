import { useEffect, useState } from "react";
import Board from "./components/Board";
import { useBoardStore } from "./store/boardStore";

function App() {
  const hydrate = useBoardStore((s) => s.hydrate);
  const hydrated = useBoardStore((s) => s.hydrated);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrate().then(() => setReady(true));
  }, [hydrate]);

  if (!ready || !hydrated) {
    return <div className="h-screen w-screen bg-[#141620]" />;
  }

  return (
    <div className="h-screen w-screen">
      <Board />
    </div>
  );
}

export default App;
