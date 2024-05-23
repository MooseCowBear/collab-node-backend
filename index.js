import * as http from "http";
import { Server } from "socket.io";
import { ChangeSet, Text } from "@codemirror/state";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const server = http.createServer();

let documents = new Map();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* this is going to have to get the starting document through an api
call to the python backend. needs to grab the right scenario from the 
database and add it to the documents map so that people who enter a collab after
there have been changes get the most recent version of the doc */

function getDocument(name) {
  if (documents.has(name)) return documents.get(name);
  // read file
  const filePath = path.join(__dirname, "docs", `${name}.txt`);
  console.log("reading:", filePath);

  try {
    const buffer = fs.readFileSync(filePath);
    const fileContent = buffer.toString();

    const documentContent = {
      updates: [],
      pending: [],
      doc: Text.of([fileContent]),
    };

    documents.set(name, documentContent);
  } catch {
    console.log("could not read from file");
  }
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

      if (version != updates.length) {
        socket.emit("pushUpdateResponse", false);
      } else {
        for (let update of docUpdates) {
          // Convert the JSON representation to an actual ChangeSet
          // instance
          let changes = ChangeSet.fromJSON(update.changes);
          updates.push({
            changes,
            clientID: update.clientID,
            effects: update.effects,
          });
          documents.set(documentName, { updates, pending, doc });
          doc = changes.apply(doc);
          documents.set(documentName, { updates, pending, doc });
        }
        socket.emit("pushUpdateResponse", true);

        while (pending.length) {
          pending.pop()(updates);
        }
        documents.set(documentName, { updates, pending, doc });
      }
    } catch (error) {
      console.error("pushUpdates", error);
    }
  });

  socket.on("getDocument", (documentName) => {
    try {
      const document = getDocument(documentName);
      if (document) {
        socket.emit(
          "getDocumentResponse",
          document.updates.length,
          document.doc.toString()
        );
      }
    } catch (error) {
      console.error("getDocument", error);
    }
  });

  /* this needs to be make a post request to the python backend to save 
  the document to the database. */
  socket.on("save", (documentName) => {
    console.log("saving");
    const lines = documents.get(documentName).doc.text;
    const file = fs.createWriteStream(`docs/${documentName}.txt`);

    file.on("error", function (err) {
      console.log("error trying to save", err);
    });
    lines.forEach(function (line) {
      file.write(line + "\n");
    });
    file.end();
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server listening on port: ${port}`));
