## 1. 백업 만들어두기

막시무스 업데이트 시 늘 백업하고 있지는 않지만, 최대한으로 안정적으로 운영하기 위해서는 백업을 남겨두는게 
- 마스토돈 서비스 중지
```
sudo systemctl stop mastodon-web mastodon-sidekiq mastodon-streaming
```
- postgres DB 백업 
```
sudo -u postgres pg_dump -Fc mastodon_production > ~/mastodon_backup.dump
```
- 미디어파일 백업
 ```
 sudo tar -cvf ~/mastodon_media_backup.tar.gz /home/mastodon/live/public/system
```
## 2. 업데이트 불러오기

- 유저 변경 및 마스토돈 디렉토리로 이동
```
sudo su - mastodon
cd ~/live
```

- 로컬 변경 stash해두기 (글자 수 변경 등 코드의 직접적 config 변경 시 필요)
```
git stash    
```

- 릴리즈된 최근 버전들 불러오기
```
git fetch --tags
```

- git checkout 하기. 현재 경우 4.4.5로 업데이트하였다. 
```
git checkout v4.4.5
```

- stash 적용
```
git stash apply
```
remote측 변경이 생긴다면 conflict 해결이 필요하겠지만, 능력껏 고치면 되겠다. 

## 3. 서버 업그레이드

- 디펜던시 설치 
```
   bundle install
   yarn install --immutable
```

> **루비 버전 이슈**
	루비 버전 이슈가 생겼다. 그 경우 시키는대로 하면 되는데, `rbenv install` 를 통해 새 버전을 설치하면 된다. 만일 버전이 없다고 하면 역시 시키는대로 git -C로 해결 가능하다. 


- DB 마이그레이션 
```
RAILS_ENV=production bundle exec rails db:migrate
```
- 애샛 프리컴파일
```
RAILS_ENV=production bundle exec rails assets:precompile
```

## 4. 재시작

- 마스토돈 유저에서 일반 유저로 전환
```
exit
``` 

- 마스토돈 서비스 재시작

```
systemctl restart mastodon-sidekiq
systemctl reload mastodon-web
systemctl restart mastodon-streaming
```

## 참조
- https://docs.joinmastodon.org/admin/upgrading/