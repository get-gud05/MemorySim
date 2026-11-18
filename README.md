# System Storage Simulator

System Storage Simulator is a web app for running and viewing storage and memory simulations. It models a database buffer pool and operating system virtual memory, and displays the resulting page activity, cache hits and misses, page faults, and evictions.

The simulator supports LRU, FIFO, and Clock page replacement policies, with workloads such as sequential, random, and high-locality access. The project includes a React frontend, a Node.js/Express API, and a C++ simulation engine. Simulation history can be stored in MongoDB; the app can also run without a database, though history will not persist.

## Run locally

Requirements: Node.js with npm, and the C++ simulator executable. A prebuilt Linux executable is included at `engine/simulator`. On other platforms, build or provide a compatible executable (`engine/simulator.exe` on Windows).

1. Install the frontend and backend dependencies from the project root:

   ```sh
   npm install --prefix server
   npm install --prefix client
   ```

2. Start the API in one terminal:

   ```sh
   npm run server
   ```

3. Start the frontend in another terminal:

   ```sh
   npm run dev
   ```

4. Open [http://localhost:5173](http://localhost:5173).

The frontend expects the API at `http://localhost:5000`. To save experiment history, set `MONGO_URI` in `server/.env` to your MongoDB connection string before starting the API. Without it, simulations still run, but history is not saved.

If you have changed the C++ engine and want to rebuild it on Linux or macOS, from the project root run:

```sh
cmake -S engine -B engine/build
cmake --build engine/build
```

Then point the backend at the newly built executable when starting the server:

```sh
ENGINE_PATH=../engine/build/simulator npm run server
```
