import { uploadImage } from "./src/utils/uploadImage.js";

document.getElementById("complaintForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const file = document.getElementById("image").files[0];
  const imageUrl = await uploadImage(file);

  const complaintData = {
    name: document.getElementById("name").value,
    complaint: document.getElementById("complaint").value,
    imageUrl
  };

  await fetch("/api/complaints", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(complaintData)
  });
});