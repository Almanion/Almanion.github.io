// Deterministic offline authoring search. Runtime never follows these witnesses.
#include <bits/stdc++.h>
using namespace std;const double PI=acos(-1.),DT=1./120.;
struct V{double x,y;};struct Body{double x,y,r,mu,rx,ry,period,phase,dir;};struct S{double x,y,vx,vy,t;};
struct Event{int body;double from,to,sweep,radius;};struct Portal{V entrance,exit;double t;};
struct Route{double angle,speed;vector<S> path;vector<Event>events;vector<Portal> portals;};
V at(const Body&p,double t){double a=p.phase+p.dir*2*PI*t/p.period;return {p.x+p.rx*cos(a),p.y+p.ry*sin(a)};}
V acc(S s,const vector<Body>&ps){V a{0,0};for(auto&p:ps){auto z=at(p,s.t);double dx=z.x-s.x,dy=z.y-s.y,d=dx*dx+dy*dy+16,k=p.mu/(d*sqrt(d));a.x+=dx*k;a.y+=dy*k;}return a;}
S step(S s,const vector<Body>&ps,double dt=DT){auto a=acc(s,ps);S n{s.x+s.vx*dt+a.x*dt*dt/2,s.y+s.vy*dt+a.y*dt*dt/2,s.vx,s.vy,s.t+dt};auto b=acc(n,ps);n.vx+=(a.x+b.x)*dt/2;n.vy+=(a.y+b.y)*dt/2;return n;}
bool safe(S s,const vector<Body>&ps){if(s.x<18||s.x>1182||s.y<18||s.y>682)return false;for(auto&p:ps){auto z=at(p,s.t);if(hypot(s.x-z.x,s.y-z.y)<p.r+14)return false;}return true;}
double rnd(mt19937&g,double a,double b){return a+(b-a)*generate_canonical<double,32>(g);}
bool route(const vector<Body>&ps,Body target,V start,vector<int>order,double angle,double speed,mt19937&g,Route&out){
 S s{start.x,start.y,speed*cos(angle*PI/180),-speed*sin(angle*PI/180),0};out.angle=angle;out.speed=speed;out.path={s};
 for(int k=0;k<(int)order.size();k++){
  int body=order[k];auto pos=at(ps[body],s.t);double last=atan2(s.y-pos.y,s.x-pos.x),sum=0,begin=s.t;bool completed=false;
  for(int tick=0;tick<2200;tick++){S n=step(s,ps);if(!safe(n,ps))return false;s=n;out.path.push_back(s);auto z=at(ps[body],s.t);double d=hypot(s.x-z.x,s.y-z.y),a=atan2(s.y-z.y,s.x-z.x);if(d>180)return false;sum+=remainder(a-last,2*PI);last=a;if(abs(sum)>4.47){completed=true;break;}}
  if(!completed)return false;out.events.push_back({body,begin,s.t,sum,180});double v=hypot(s.vx,s.vy),ux=s.vx/v,uy=s.vy/v;V ent{s.x+ux*18,s.y+uy*18},dest;
  if(k+1<(int)order.size()){
   int next=order[k+1];auto z=at(ps[next],s.t);double r=clamp(ps[next].mu/(v*v)*rnd(g,.96,1.06),46.,135.);double rot=atan2(uy,ux)+(rnd(g,0,1)<.5?-1:1)*PI/2+rnd(g,-.025,.025);dest={z.x+r*cos(rot),z.y+r*sin(rot)};
  }else{
   double T=.55;auto q=at(target,s.t+T);dest={q.x-s.vx*T,q.y-s.vy*T};
   for(int j=0;j<3;j++){S test{dest.x,dest.y,s.vx,s.vy,s.t};for(int t=0;t<66;t++)test=step(test,ps);dest.x+=q.x-test.x;dest.y+=q.y-test.y;}
  }
  V mouth{dest.x-ux*25,dest.y-uy*25};out.portals.push_back({ent,mouth,s.t});s.x=dest.x;s.y=dest.y;if(!safe(s,ps))return false;out.path.push_back(s);
 }
 for(int j=0;j<90;j++){s=step(s,ps);if(!safe(s,ps))return false;out.path.push_back(s);auto q=at(target,s.t);if(hypot(s.x-q.x,s.y-q.y)<5)return true;}return false;
}
void vectorjson(V v){cout<<"{\"x\":"<<v.x<<",\"y\":"<<v.y<<"}";}
void bodyjson(Body p){auto z=at(p,0);cout<<"{\"x\":"<<z.x<<",\"y\":"<<z.y<<",\"r\":"<<p.r<<",\"mu\":"<<p.mu;if(p.rx)cout<<",\"motion\":{\"cx\":"<<p.x<<",\"cy\":"<<p.y<<",\"rx\":"<<p.rx<<",\"ry\":"<<p.ry<<",\"period\":"<<p.period<<",\"phase\":"<<p.phase<<",\"direction\":"<<p.dir<<"}";cout<<"}";}
void routejson(Route&r){cout<<"{\"angle\":"<<r.angle<<",\"speed\":"<<r.speed<<",\"path\":[";for(int i=0;i<(int)r.path.size();i++){auto s=r.path[i];if(i)cout<<",";cout<<"["<<s.x<<","<<s.y<<","<<s.vx<<","<<s.vy<<","<<s.t<<"]";}cout<<"],\"events\":[";for(int i=0;i<(int)r.events.size();i++){auto e=r.events[i];if(i)cout<<",";cout<<"{\"body\":"<<e.body<<",\"from\":"<<e.from<<",\"to\":"<<e.to<<",\"sweep\":"<<e.sweep<<",\"radius\":"<<e.radius<<"}";}cout<<"],\"portals\":[";for(int i=0;i<(int)r.portals.size();i++){auto p=r.portals[i];if(i)cout<<",";cout<<"{\"entrance\":{\"x\":"<<p.entrance.x<<",\"y\":"<<p.entrance.y<<",\"r\":18},\"exit\":{\"x\":"<<p.exit.x<<",\"y\":"<<p.exit.y<<",\"r\":18},\"t\":"<<p.t<<"}";}cout<<"]}";}
int main(int argc,char**argv){int family=argc>1?atoi(argv[1]):0,wanted=argc>2?atoi(argv[2]):32;mt19937 g(239881+family*181);int found=0;cout<<setprecision(14)<<"[";for(int trial=0;trial<900000&&found<wanted;trial++){
 vector<Body>ps;vector<V>cs={{295,195},{880,175},{905,525},{290,525}};for(int i=0;i<4;i++)ps.push_back({cs[i].x+rnd(g,-14,14),cs[i].y+rnd(g,-12,12),rnd(g,23,29),round(rnd(g,1.05e6,1.60e6)/1000)*1000,family?rnd(g,9,17):0,family?rnd(g,8,15):0,rnd(g,26,45),rnd(g,0,6.28),i%2?-1.:1.});
 Body target{595,355,22,0,family==2?14.:0.,family==2?10.:0.,29,.5,1};auto p=at(ps[0],0);double theta=rnd(g,-PI,PI),r=rnd(g,86,115);V start{round(p.x+r*cos(theta)),round(p.y+r*sin(theta))};double v=round(sqrt(ps[0].mu/r)*rnd(g,.92,1.02));double aa=round(-remainder(theta+PI/2+rnd(g,-.035,.035),2*PI)*180/PI*10)/10,bb=round(-remainder(theta-PI/2+rnd(g,-.035,.035),2*PI)*180/PI*10)/10;
 vector<int>a,b;if(family==0){a=found%4<2?vector<int>{0}:vector<int>{0,1};b=found%4<2?vector<int>{0}:vector<int>{0,3};}else if(family==1){a=found%4<2?vector<int>{0,1,2}:vector<int>{0,1,2,3};b=found%4<2?vector<int>{0,3,2}:vector<int>{0,3,2,1};}else{a=found%4==3?vector<int>{0,1,2,3,0}:vector<int>{0,1,2,3};b=found%4==3?vector<int>{0,3,2,1,0}:vector<int>{0,3,2,1};}
 Route A,B;if(!route(ps,target,start,a,aa,v,g,A))continue;if(family!=3&&!route(ps,target,start,b,bb,v+(found%2?1:0),g,B))continue;if(found)cout<<",";cout<<"{\"family\":"<<family<<",\"start\":";vectorjson(start);cout<<",\"planets\":[";for(int i=0;i<4;i++){if(i)cout<<",";bodyjson(ps[i]);}cout<<"],\"target\":";bodyjson(target);cout<<",\"a\":";routejson(A);if(family!=3){cout<<",\"b\":";routejson(B);}cout<<"}";found++;
 }cout<<"]";cerr<<"family "<<family<<" seeds "<<found<<"\n";return found<wanted?1:0;}
