import * as http from "http";
import { Server } from "socket.io";
import { ChangeSet, Text } from "@codemirror/state";

const server = http.createServer();

let documents = new Map();

function getDocument(name) {
  if (documents.has(name)) return documents.get(name);

  // won't need this bc will be fetching from existing scenario. 
  // will want to set that as the initial doc content
  const documentContent = {
    updates: [],
    pending: [],
    doc: Text.of([`Hello World from ${name}\n`]),
  };
  documents.set(name, documentContent);
  return documentContent;
}

let io = new Server(server, {
  path: "/api",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("a user connected!");

  socket.on("pullUpdates", (documentName, version) => {
    try {
      const { updates, pending, doc } = getDocument(documentName);

      if (version < updates.length) {
        socket.emit(
          "pullUpdateResponse",
          JSON.stringify(updates.slice(version))
        );
      } else {
        pending.push((updates) => {
          socket.emit(
            "pullUpdateResponse",
            JSON.stringify(updates.slice(version))
          );
        });
        documents.set(documentName, { updates, pending, doc });
      }
    } catch (error) {
      console.error("pullUpdates", error);
    }
  });

  socket.on("pushUpdates", (documentName, version, docUpdates) => {
    try {
      let { updates, pending, doc } = getDocument(documentName);
      docUpdates = JSON.parse(docUpdates);
      // console.log(
      //   "doc updates",
      //   docUpdates,
      //   "version",
      //   version,
      //   "updates.length",
      //   updates.length
      // );

      if (version != updates.length) {
        console.log("version does not match updates length");
        socket.emit("pushUpdateResponse", false);
      } else {
        console.log("trying to update, entering for loop");
        for (let update of docUpdates) {
          // Convert the JSON representation to an actual ChangeSet
          // instance
          let changes = ChangeSet.fromJSON(update.changes);
          console.log("changes", changes);
          updates.push({
            changes,
            clientID: update.clientID,
            effects: update.effects,
          });
          documents.set(documentName, { updates, pending, doc });
          //console.log("documents after first set", documents, documentName);
          doc = changes.apply(doc);
          documents.set(documentName, { updates, pending, doc });
          //console.log("documents after second set", documents);
        }
        socket.emit("pushUpdateResponse", true);

        while (pending.length) {
          pending.pop()(updates);
        }
        documents.set(documentName, { updates, pending, doc });
        //console.log("documents at end of push updates", documents);
      }
    } catch (error) {
      console.error("pushUpdates", error);
    }
  });

  socket.on("getDocument", (documentName) => {
    try {
      let { updates, doc } = getDocument(documentName);
      socket.emit("getDocumentResponse", updates.length, doc.toString());
    } catch (error) {
      console.error("getDocument", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server listening on port: ${port}`));
