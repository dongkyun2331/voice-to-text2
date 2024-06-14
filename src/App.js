import React, { useState, useEffect } from "react";

const App = () => {
  const [isListening, setIsListening] = useState(false);
  const [text, setText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [recognition, setRecognition] = useState(null);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recog = new SpeechRecognition();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = "ko-KR";

      recog.onresult = (event) => {
        let finalTranscript = "";
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        setText((prevText) => prevText + finalTranscript);
        setInterimText(interimTranscript);
      };

      recog.onend = () => {
        if (isListening) {
          recog.start();
        }
      };

      setRecognition(recog);
    } else {
      alert("이 브라우저는 음성 인식을 지원하지 않습니다.");
    }
  }, [isListening]);

  const handleListen = () => {
    if (recognition) {
      if (isListening) {
        recognition.stop();
      } else {
        recognition.start();
      }
      setIsListening(!isListening);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>음성을 텍스트로 변환</h1>
      <button onClick={handleListen}>{isListening ? "중지" : "시작"}</button>
      <p>
        {text} <span style={{ color: "gray" }}>{interimText}</span>
      </p>
    </div>
  );
};

export default App;
