import axios from "axios";

export async function uploadImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "grievance_upload");

  const res = await axios.post(
    "https://api.cloudinary.com/v1_1/YOUR_CLOUD_NAME/image/upload",
    formData
  );

  return res.data.secure_url;
}