import grpc
import json

from nest_pb2_grpc import NestServiceStub 

import nest_pb2 as nest_pb2
import nest_pb2_grpc as nest_pb2_grpc

secretKey = "1c1176a977eb43e1a4afa5b58add495f"

channel = grpc.secure_channel(
        'clovaspeech-gw.ncloud.com:50051',
        grpc.ssl_channel_credentials()
)
client = NestServiceStub(channel)
metadata = (("authorization", f"Bearer {secretKey}"),) #소문자 authorization 필수 / secretkey는 장문인식 도메인에서 확인
call = client.YourMethod(YourRequest(), metadata=metadata)