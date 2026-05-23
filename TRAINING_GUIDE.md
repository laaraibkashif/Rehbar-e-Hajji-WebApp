# Training Your Custom AI Model (Hajj & Umrah Expert)

To move away from generic APIs like Groq and use "Your Own Model", you need to follow a process called **Fine-Tuning**. This allows a base model (like Llama 3 or Mistral) to become an expert in specific Islamic rituals, Fiqh, and pilgrimage logistics.

## 1. Data Collection & Formatting
The quality of your model depends entirely on the data. You need a dataset of Questions and Answers.

### Example Dataset Format (JSONL):
```json
{"instruction": "What are the obligatory acts (Wajibat) of Umrah?", "context": "Islamic Fiqh according to authentic sources.", "response": "The Wajibat of Umrah are two: 1. Wearing Ihram from the Miqat. 2. Shaving or cutting the hair (Halq or Taqsir)."}
{"instruction": "What should I do if I forget a circuit in Tawaf?", "context": "Pilgrimage rituals.", "response": "If you remember during the Tawaf, you should start that circuit again. If you remember after finishing, you may need to repeat the Tawaf depending on how many circuits were missed."}
```

## 2. Model Selection
For local deployment, we recommend:
- **Llama 3.1 8B**: Excellent performance/size ratio.
- **Mistral 7B v0.3**: Very reliable and easy to fine-tune.
- **Phi-3 Mini**: extremely lightweight (can run on basic laptops).

## 3. The Fine-Tuning Process
We recommend using **Unsloth** (fastest) or **AutoTrain** (easiest).

### Using Unsloth (Standard Method):
1. **Prepare a Google Colab notebook**.
2. **Install Unsloth**: `pip install unsloth`.
3. **Load Base Model**: Load `unsloth/llama-3-8b-bnb-4bit`.
4. **Train**: Run the training script with your JSONL dataset.
5. **Export to GGUF**: This format is required for local hosting tools.

## 4. Local Hosting (The "Our Model" Part)
Once you have your trained `.gguf` file:
1. **Download Ollama**: [ollama.com](https://ollama.com)
2. **Create a ModelFile**:
   ```text
   FROM ./your-trained-model.gguf
   SYSTEM "You are AskPilgrim, a Hajj and Umrah expert guide."
   PARAMETER temperature 0.7
   ```
3. **Create the model**: `ollama create hajj-expert -f ModelFile`
4. **Run it**: `ollama run hajj-expert`

## 5. Connecting to the Web App
The web app is now configured to call `http://localhost:11434/api/chat`.
Ollama serves your model on this port automatically.

### Why this is better than Groq:
- **Full Privacy**: Conversations never leave your server.
- **Offline Capability**: Works without internet once the model is loaded.
- **Zero Cost**: No per-token API fees.
- **Custom Knowledge**: The model knows your specific app features and guides.
