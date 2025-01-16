import React, { useState, useEffect } from 'react';
import axios from 'axios';
import config from './config';

const loadConfig = async () => {
  try {
    const response = await axios.get('/config.json');
    return response.data;
  } catch (error) {
    console.error('Error loading config:', error);
    return null;
  }
};

const { ipAddress } = await loadConfig();

const { port, http } = config;

const App = () => {
  const [isListening, setIsListening] = useState(false);
  const [text, setText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [recognition, setRecognition] = useState(null);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const recog = new window.webkitSpeechRecognition();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = 'ko-KR';

      recog.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        setText(finalTranscript);
        setInterimText(interimTranscript);
      };

      recog.onend = async () => {
        await axios.post(`${http}://${ipAddress}:${port}/save-text`, { text });
      };

      setRecognition(recog);
    } else {
      alert('이 브라우저는 음성 인식을 지원하지 않습니다.');
    }
  }, [isListening, text]);

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

  useEffect(() => {
    const fetchData = async () => {
      const result = await axios.get(`${http}://${ipAddress}:${port}/get-text`);
      setText(result.data.text);
    };
    fetchData();
  }, []);

  return (
    <div
      style={{
        textAlign: 'center',
        marginTop: '50px',
        backgroundColor: 'transparent',
      }}
    >
      <h1>음성을 텍스트로 변환</h1>
      <button onClick={handleListen}>{isListening ? '중지' : '시작'}</button>
      <p>
        {text} <span style={{ color: 'gray' }}>{interimText}</span>
      </p>
    </div>
  );
};

export default App;
