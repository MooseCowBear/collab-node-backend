import * as http from "http";
import { Server } from "socket.io";
import { ChangeSet, Text } from "@codemirror/state";

const server = http.createServer();

let updates = [];
let doc = Text.of(["Starting document"]);
let pending = [];

let io = new Server(server, {
  path: "/api",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("a user connected!");
  socket.on("pullUpdates", (version) => {
    if (version < updates.length) {
      socket.emit("pullUpdateResponse", JSON.stringify(updates.slice(version)));
    } else {
      pending.push((updates) => {
        io.emit("pullUpdateResponse", JSON.stringify(updates.slice(version)));
      });
    }
  });

  socket.on("pushUpdates", (version, docUpdates) => {
    docUpdates = JSON.parse(docUpdates);
    try {
      if (version != updates.length) {
        io.emit("pushUpdateResponse", false);
      } else {
        for (let update of docUpdates) {
          let changes = ChangeSet.fromJSON(update.changes);
          updates.push({ changes, clientID: update.clientID });
          doc = changes.apply(doc);
        }
        socket.emit("pushUpdateResponse", true);
        while (pending.length) {
          pending.pop()(updates);
        }
        console.log(
          "pending, updates at the end of while loop:",
          pending,
          updates
        );
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("getDocument", () => {
    console.log("emitting a response from server");
    io.emit("getDocumentResponse", updates.length, doc.toString());
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });

  socket.on("test", () => {
    console.log("the test has passed");
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server listening on port: ${port}`));
