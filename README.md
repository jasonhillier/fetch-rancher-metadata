# fetch-rancher-metadata

Command-Line utility to fetch and merge JSON data from Rancher metadata service

## Install
```sh
$ npm install -g fetch-rancher-metadata
```

## Rancher-Compose.yml
```yml
myService:
  # Scale of service
  scale: 1
  # User added metadata
  metadata:
    config:
      option1: newValue1
      option2: newValue2
```

## Docker container local JSON file (e.g. Application-Config.json)
```json
{
    "option1": "oldValue",
    "option2": "oldValue"
}
```

## Execution within service docker container
```sh
fetch-rancher-metadata --key "config" --merge "Application-Config.json"
```

## Result (e.g. Application-Config.json)
```json
{
    "option1": "newValue1",
    "option2": "newValue2"
}
```